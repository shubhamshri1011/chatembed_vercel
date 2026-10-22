import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const BATCH_SIZE = 50;     // messages per batch to stay within Meta rate limits
const BATCH_DELAY_MS = 1000; // 1 second between batches

interface RecipientRow {
  phone: string;
  name?: string;
  [key: string]: string | undefined;
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl  = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey   = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase     = createClient(supabaseUrl, serviceKey);

  try {
    // ── Auth ─────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { campaign_id, dry_run } = body;

    if (!campaign_id) return json({ error: 'campaign_id required' }, 400);

    // ── Load campaign ─────────────────────────────────────────
    const { data: campaign, error: campErr } = await supabase
      .from('wa_campaigns')
      .select('*, wa_templates(*), wa_numbers(*)')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404);
    if (!['draft','scheduled'].includes(campaign.status)) {
      return json({ error: `Campaign status is "${campaign.status}" — cannot send` }, 400);
    }

    const waNumber: { access_token: string; phone_number_id: string } = campaign.wa_numbers;
    const template: { name: string; language: string; components: unknown[] } = campaign.wa_templates;

    if (!waNumber?.access_token) return json({ error: 'No WhatsApp number connected' }, 400);
    if (!template?.name) return json({ error: 'No template attached to campaign' }, 400);

    // ── Load opted-in recipients ──────────────────────────────
    const { data: optIns } = await supabase
      .from('wa_opt_ins')
      .select('phone')
      .eq('user_id', user.id)
      .eq('status', 'opted_in');

    const recipients: RecipientRow[] = (optIns ?? []).map((r: { phone: string }) => ({ phone: r.phone }));

    if (recipients.length === 0) {
      return json({ error: 'No opted-in recipients. Upload contacts and get opt-in first.' }, 400);
    }

    if (dry_run) {
      return json({ dry_run: true, recipients_count: recipients.length, campaign_id });
    }

    // ── Mark campaign as sending ──────────────────────────────
    await supabase.from('wa_campaigns')
      .update({ status: 'sending', recipients_total: recipients.length, updated_at: new Date().toISOString() })
      .eq('id', campaign_id);

    // ── Send in batches ───────────────────────────────────────
    let sentCount = 0, failedCount = 0;

    for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
      const batch = recipients.slice(i, i + BATCH_SIZE);

      const results = await Promise.allSettled(
        batch.map(r => sendWhatsAppMessage(waNumber, template, r, campaign.template_vars))
      );

      const messageRows = results.map((result, idx) => {
        const phone = batch[idx].phone;
        const success = result.status === 'fulfilled' && result.value.ok;
        const waId = success ? (result.value as { wamid?: string }).wamid : undefined;
        if (success) sentCount++; else failedCount++;

        return {
          user_id: user.id,
          campaign_id,
          to_phone: phone,
          wa_message_id: waId ?? null,
          direction: 'outbound',
          category: template.name?.toLowerCase().includes('util') ? 'utility' : 'marketing',
          status: success ? 'sent' : 'failed',
          body_preview: `[Template: ${template.name}]`,
          error_message: !success && result.status === 'rejected' ? String(result.reason) : null,
        };
      });

      await supabase.from('wa_messages').insert(messageRows);

      // Update campaign counts after each batch
      await supabase.from('wa_campaigns')
        .update({ sent_count: sentCount, failed_count: failedCount, updated_at: new Date().toISOString() })
        .eq('id', campaign_id);

      // Rate limit pause between batches
      if (i + BATCH_SIZE < recipients.length) {
        await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    // ── Finalise campaign ─────────────────────────────────────
    await supabase.from('wa_campaigns')
      .update({ status: 'sent', sent_count: sentCount, failed_count: failedCount, updated_at: new Date().toISOString() })
      .eq('id', campaign_id);

    return json({ success: true, sent: sentCount, failed: failedCount, total: recipients.length });

  } catch (err) {
    console.error('wa-send error:', err);
    return json({ error: 'Internal error', detail: String(err) }, 500);
  }
});

// ── Helpers ───────────────────────────────────────────────────

async function sendWhatsAppMessage(
  waNumber: { access_token: string; phone_number_id: string },
  template: { name: string; language: string; components: unknown[] },
  recipient: RecipientRow,
  templateVars: Record<string, string>
): Promise<{ ok: boolean; wamid?: string }> {
  const phone = recipient.phone.replace(/[^0-9]/g, '');

  const payload = {
    messaging_product: 'whatsapp',
    to: phone,
    type: 'template',
    template: {
      name: template.name,
      language: { code: template.language || 'en' },
      components: buildComponents(template.components, recipient, templateVars),
    },
  };

  const res = await fetch(
    `https://graph.facebook.com/v19.0/${waNumber.phone_number_id}/messages`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${waNumber.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    }
  );

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data?.error?.message ?? `Meta API ${res.status}`);
  }
  return { ok: true, wamid: data?.messages?.[0]?.id };
}

function buildComponents(
  components: unknown[],
  recipient: RecipientRow,
  vars: Record<string, string>
): unknown[] {
  // Simple variable substitution: {{1}} → vars['1'] or recipient.name etc.
  return (components as Array<Record<string,unknown>>).map((comp) => {
    if (comp.type === 'body' && Array.isArray(comp.parameters)) {
      return {
        ...comp,
        parameters: (comp.parameters as Array<Record<string,unknown>>).map((p, idx) => ({
          type: 'text',
          text: vars[String(idx + 1)] ?? recipient.name ?? p.text ?? '',
        })),
      };
    }
    return comp;
  });
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
