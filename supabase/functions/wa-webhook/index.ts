import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Meta India estimated rates (per conversation) — kept in sync with wa_rates table
const FALLBACK_RATES: Record<string, number> = {
  marketing: 0.78,
  utility: 0.31,
  authentication: 0.14,
  service: 0.00, // Service conversations are free within 24h window
};

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── 1. Meta Webhook Verification (GET) ───────────────────────
  if (req.method === 'GET') {
    const mode        = url.searchParams.get('hub.mode');
    const token       = url.searchParams.get('hub.verify_token');
    const challenge   = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? 'embedease_wa_verify_2026';

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 2. POST: Signature verification (Requirement 4) ─────────
  const rawBody = await req.text();
  const signature = req.headers.get('x-hub-signature-256');
  const appSecret = Deno.env.get('META_APP_SECRET') || Deno.env.get('WHATSAPP_APP_SECRET');

  if (appSecret) {
    if (!signature) {
      return new Response('Missing X-Hub-Signature-256', { status: 401 });
    }
    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(appSecret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sigBuffer = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(rawBody));
    const expectedSig = 'sha256=' + Array.from(new Uint8Array(sigBuffer))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    if (signature !== expectedSig) {
      console.warn('Invalid webhook signature');
      return new Response('Invalid Signature', { status: 403 });
    }
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  try {
    const entries = (payload.entry as Array<Record<string, unknown>>) ?? [];

    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string, unknown>>) ?? [];

      for (const change of changes) {
        const val = change.value as Record<string, unknown>;
        const metadata = val.metadata as Record<string, string> | undefined;
        const phoneNumberId = metadata?.phone_number_id;

        // Route by phone_number_id to find owner
        let targetUserId: string | null = null;
        if (phoneNumberId) {
          const { data: numRow } = await supabase
            .from('wa_numbers')
            .select('user_id')
            .eq('phone_number_id', phoneNumberId)
            .maybeSingle();
          if (numRow) targetUserId = numRow.user_id;
        }

        // ── Delivery Status Updates (Idempotent) ───────────────
        const statuses = (val.statuses as Array<Record<string, unknown>>) ?? [];
        for (const st of statuses) {
          const wamid     = st.id as string;
          const newStatus = mapMetaStatus(st.status as string);
          const pricing   = st.pricing as Record<string, unknown> | undefined;
          const category  = (pricing?.category as string ?? '').toLowerCase() || 'marketing';
          const billable  = pricing?.billable === true;

          // Lookup cost from wa_rates table
          let cost = 0;
          if (billable && category !== 'service') {
            const { data: rateRow } = await supabase
              .from('wa_rates')
              .select('rate_inr, platform_fee_inr')
              .eq('category', category)
              .maybeSingle();
            cost = rateRow
              ? Number(rateRow.rate_inr) + Number(rateRow.platform_fee_inr)
              : (FALLBACK_RATES[category] ?? 0.78) + 0.05;
          }

          // Check existing message to guarantee idempotence
          const { data: msgRow } = await supabase
            .from('wa_messages')
            .select('id, campaign_id, user_id, status')
            .eq('wa_message_id', wamid)
            .maybeSingle();

          if (msgRow) {
            // Only update if status is actually changing (prevents duplicate counting)
            if (msgRow.status !== newStatus) {
              await supabase.from('wa_messages')
                .update({
                  status: newStatus,
                  billable,
                  cost,
                  category,
                  ts: new Date().toISOString()
                })
                .eq('id', msgRow.id);

              // Update campaign aggregate counters idempotently
              if (msgRow.campaign_id) {
                await updateCampaignStats(supabase, msgRow.campaign_id, newStatus, cost);
              }
            }
          }
        }

        // ── Inbound Messages (Opt-out ONLY on exact STOP / UNSUBSCRIBE) ──
        const messages = (val.messages as Array<Record<string, unknown>>) ?? [];
        for (const msg of messages) {
          const from = msg.from as string;
          const rawText = ((msg.text as Record<string, unknown>)?.body as string ?? '').trim();
          const upperText = rawText.toUpperCase();

          // Requirement 4: ONLY exact STOP or UNSUBSCRIBE
          const isOptOut = upperText === 'STOP' || upperText === 'UNSUBSCRIBE';

          if (isOptOut && targetUserId) {
            await supabase.from('wa_opt_ins')
              .upsert({
                user_id: targetUserId,
                phone: from,
                status: 'opted_out',
                source: 'campaign_reply',
                opted_out_at: new Date().toISOString(),
              }, { onConflict: 'user_id,phone' });

            console.log(`Explicit opt-out received: ${from} for user ${targetUserId}`);
          }

          // Log inbound message idempotently
          if (targetUserId) {
            const { data: existingInbound } = await supabase
              .from('wa_messages')
              .select('id')
              .eq('wa_message_id', msg.id as string)
              .maybeSingle();

            if (!existingInbound) {
              await supabase.from('wa_messages').insert({
                user_id: targetUserId,
                wa_message_id: msg.id as string,
                direction: 'inbound',
                from_phone: from,
                phone: from,
                body_preview: rawText.substring(0, 120),
                status: 'replied',
                ts: new Date().toISOString(),
              });

              // Increment replied counter on campaign
              const { data: lastMsg } = await supabase
                .from('wa_messages')
                .select('id, campaign_id')
                .eq('user_id', targetUserId)
                .or(`to_phone.eq.${from},phone.eq.${from}`)
                .eq('direction', 'outbound')
                .order('ts', { ascending: false })
                .limit(1)
                .maybeSingle();

              if (lastMsg?.campaign_id) {
                await updateCampaignStats(supabase, lastMsg.campaign_id, 'replied', 0);
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('wa-webhook error:', err);
  }

  // Always return 200 to Meta
  return new Response('EVENT_RECEIVED', { status: 200 });
});

function mapMetaStatus(metaStatus: string): string {
  const map: Record<string, string> = {
    sent: 'sent', delivered: 'delivered', read: 'read', failed: 'failed',
  };
  return map[metaStatus] ?? metaStatus;
}

async function updateCampaignStats(
  supabase: ReturnType<typeof createClient>,
  campaignId: string,
  status: string,
  cost: number
) {
  const col = status === 'delivered' ? 'delivered_count'
            : status === 'read'      ? 'read_count'
            : status === 'replied'   ? 'replied_count'
            : status === 'failed'    ? 'failed_count'
            : null;

  if (!col) return;

  const { data: camp } = await supabase
    .from('wa_campaigns')
    .select(col + ', total_cost')
    .eq('id', campaignId)
    .single();

  if (camp) {
    await supabase.from('wa_campaigns').update({
      [col]: (camp[col] ?? 0) + 1,
      total_cost: (Number(camp.total_cost || 0) + cost).toFixed(4),
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId);
  }
}
