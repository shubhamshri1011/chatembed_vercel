import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const CHUNK_SIZE = 50; // process 50 recipients per invocation to prevent Edge Function timeout

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    // ── 1. Require JWT & Verify Campaign Ownership ──────────────
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json();
    const { campaign_id } = body;
    if (!campaign_id) return json({ error: 'campaign_id required' }, 400);

    const { data: campaign, error: campErr } = await supabase
      .from('wa_campaigns')
      .select('*, wa_templates(*), wa_numbers(*)')
      .eq('id', campaign_id)
      .eq('user_id', user.id)
      .single();

    if (campErr || !campaign) return json({ error: 'Campaign not found' }, 404);
    if (['sent', 'failed'].includes(campaign.status)) {
      return json({ error: `Campaign status is '${campaign.status}' — already finished.` }, 400);
    }

    // ── 2. Check Plan Limits ────────────────────────────────────
    const { data: profile } = await supabase
      .from('profiles')
      .select('plan, convos_used, convos_limit')
      .eq('id', user.id)
      .single();

    const limit = profile?.convos_limit || 100;
    const used  = profile?.convos_used || 0;
    if (used >= limit) {
      return json({
        error: `Monthly conversation limit reached (${used}/${limit}). Please upgrade your plan before broadcasting.`
      }, 403);
    }

    // ── 3. Check WhatsApp Number & Approved Template ─────────────
    const waNumber = campaign.wa_numbers;
    const template = campaign.wa_templates;

    if (!waNumber?.access_token || !waNumber?.phone_number_id) {
      return json({ error: 'No active WhatsApp number credentials connected.' }, 400);
    }

    if (!template?.name) {
      return json({ error: 'No template attached to campaign.' }, 400);
    }

    // Requirement 6: Block sending of non-approved templates
    if (template.status !== 'APPROVED') {
      return json({
        error: `Template '${template.name}' is '${template.status}'. Only APPROVED templates can be broadcast.`
      }, 400);
    }

    // ── 4. Load Opted-in Recipients with Resumable Pagination ────
    const lastProcessedIndex = campaign.last_processed_index || 0;

    const { data: optIns, count: totalOptIns } = await supabase
      .from('wa_opt_ins')
      .select('phone', { count: 'exact' })
      .eq('user_id', user.id)
      .eq('status', 'opted_in')
      .order('opted_in_at', { ascending: true })
      .range(lastProcessedIndex, lastProcessedIndex + CHUNK_SIZE - 1);

    if (!optIns || optIns.length === 0) {
      await supabase.from('wa_campaigns').update({
        status: 'sent',
        updated_at: new Date().toISOString()
      }).eq('id', campaign_id);

      return json({
        status: 'completed',
        message: 'All recipients processed.',
        total: totalOptIns || 0,
        processed: lastProcessedIndex
      });
    }

    // Mark campaign as sending
    await supabase.from('wa_campaigns').update({
      status: 'sending',
      recipients_total: totalOptIns || optIns.length,
      updated_at: new Date().toISOString()
    }).eq('id', campaign_id);

    // ── 5. Dispatch Chunk to Meta ───────────────────────────────
    let sentInBatch = 0;
    let failedInBatch = 0;
    const vars = campaign.template_vars || {};

    for (const r of optIns) {
      // Build components parameters if vars provided
      const parameters: any[] = [];
      if (vars.var1) parameters.push({ type: 'text', text: vars.var1 });
      if (vars.var2) parameters.push({ type: 'text', text: vars.var2 });

      const metaPayload = {
        messaging_product: 'whatsapp',
        to: r.phone.replace(/[^0-9]/g, ''),
        type: 'template',
        template: {
          name: template.name,
          language: { code: template.language || 'en' },
          components: parameters.length > 0 ? [{ type: 'body', parameters }] : undefined
        }
      };

      try {
        const metaRes = await fetch(
          `https://graph.facebook.com/v21.0/${waNumber.phone_number_id}/messages`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${waNumber.access_token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(metaPayload),
          }
        );

        const metaData = await metaRes.json();
        const wamid = metaData.messages?.[0]?.id;

        if (metaRes.ok && wamid) {
          sentInBatch++;
          await supabase.from('wa_messages').insert({
            user_id: user.id,
            campaign_id: campaign.id,
            wa_message_id: wamid,
            direction: 'outbound',
            phone: r.phone,
            to_phone: r.phone,
            category: template.category?.toLowerCase() || 'marketing',
            status: 'sent',
            billable: true,
            cost: template.category === 'UTILITY' ? 0.31 : 0.78,
            body_preview: `${template.name} [template]`,
            ts: new Date().toISOString()
          });
        } else {
          failedInBatch++;
          await supabase.from('wa_messages').insert({
            user_id: user.id,
            campaign_id: campaign.id,
            direction: 'outbound',
            phone: r.phone,
            to_phone: r.phone,
            status: 'failed',
            error_code: String(metaData.error?.code || 'UNKNOWN'),
            error_message: metaData.error?.message || 'Meta API error',
            ts: new Date().toISOString()
          });
        }
      } catch (e: any) {
        failedInBatch++;
      }
    }

    // Increment user convos_used
    await supabase.from('profiles').update({
      convos_used: used + sentInBatch,
      updated_at: new Date().toISOString()
    }).eq('id', user.id);

    const newIndex = lastProcessedIndex + optIns.length;
    const isFinished = newIndex >= (totalOptIns || 0);

    await supabase.from('wa_campaigns').update({
      last_processed_index: newIndex,
      sent_count: (campaign.sent_count || 0) + sentInBatch,
      failed_count: (campaign.failed_count || 0) + failedInBatch,
      status: isFinished ? 'sent' : 'sending',
      updated_at: new Date().toISOString()
    }).eq('id', campaign_id);

    return json({
      status: isFinished ? 'completed' : 'in_progress',
      batch_sent: sentInBatch,
      batch_failed: failedInBatch,
      processed: newIndex,
      total: totalOptIns || 0,
      remaining: Math.max(0, (totalOptIns || 0) - newIndex)
    });
  } catch (err: any) {
    return json({ error: err.message }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
