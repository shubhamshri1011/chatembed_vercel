import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Meta India estimated rates (per conversation) — kept in sync with wa_rates table
const FALLBACK_RATES: Record<string, number> = {
  marketing: 0.78, utility: 0.31, authentication: 0.14, service: 0.29,
};

serve(async (req: Request) => {
  const url = new URL(req.url);

  // ── 1. Meta Webhook Verification (GET) ───────────────────────
  if (req.method === 'GET') {
    const mode      = url.searchParams.get('hub.mode');
    const token     = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') ?? 'embedease_wa_verify_2026';

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge ?? '', { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 2. POST: Process incoming events ─────────────────────────
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  let payload: Record<string, unknown>;
  try {
    payload = await req.json();
  } catch {
    return new Response('Bad JSON', { status: 400 });
  }

  try {
    const entries = (payload.entry as Array<Record<string,unknown>>) ?? [];

    for (const entry of entries) {
      const changes = (entry.changes as Array<Record<string,unknown>>) ?? [];

      for (const change of changes) {
        const val = change.value as Record<string, unknown>;

        // ── Delivery Status Updates ─────────────────────────
        const statuses = (val.statuses as Array<Record<string,unknown>>) ?? [];
        for (const st of statuses) {
          const wamid      = st.id as string;
          const newStatus  = mapMetaStatus(st.status as string);
          const pricing    = st.pricing as Record<string,unknown> | undefined;
          const category   = (pricing?.category as string ?? '').toLowerCase() || 'marketing';
          const billable   = pricing?.billable === true;

          // Lookup cost from wa_rates
          let cost = 0;
          if (billable) {
            const { data: rateRow } = await supabase
              .from('wa_rates')
              .select('rate_inr, platform_fee_inr')
              .eq('category', category)
              .single();
            cost = rateRow
              ? Number(rateRow.rate_inr) + Number(rateRow.platform_fee_inr)
              : (FALLBACK_RATES[category] ?? 0.78) + 0.05;
          }

          // Update wa_messages row for this wamid
          const { data: msgRow } = await supabase
            .from('wa_messages')
            .select('id, campaign_id, user_id')
            .eq('wa_message_id', wamid)
            .single();

          if (msgRow) {
            await supabase.from('wa_messages')
              .update({ status: newStatus, billable, cost, category, ts: new Date().toISOString() })
              .eq('id', msgRow.id);

            // Update campaign aggregate counters
            if (msgRow.campaign_id) {
              await updateCampaignStats(supabase, msgRow.campaign_id, newStatus, cost);
            }
          }
        }

        // ── Inbound Messages (opt-out detection) ─────────────
        const messages = (val.messages as Array<Record<string,unknown>>) ?? [];
        for (const msg of messages) {
          const from = msg.from as string;
          const body = ((msg.text as Record<string,unknown>)?.body as string ?? '').trim().toUpperCase();

          // STOP = opt-out
          if (['STOP','UNSUBSCRIBE','OPT OUT','OPTOUT','NO'].includes(body)) {
            // Find the user who owns this phone number
            const { data: waNum } = await supabase
              .from('wa_numbers')
              .select('user_id')
              .eq('phone_number_id', val.metadata?.['phone_number_id'] as string)
              .single();

            if (waNum) {
              await supabase.from('wa_opt_ins')
                .upsert({
                  user_id: waNum.user_id,
                  phone: from,
                  status: 'opted_out',
                  source: 'campaign_reply',
                  opted_out_at: new Date().toISOString(),
                }, { onConflict: 'user_id,phone' });

              console.log(`Opted-out: ${from} for user ${waNum.user_id}`);
            }
          }

          // Log inbound message
          const { data: waNum } = await supabase
            .from('wa_numbers')
            .select('user_id')
            .eq('phone_number_id', val.metadata?.['phone_number_id'] as string)
            .single();

          if (waNum) {
            await supabase.from('wa_messages').insert({
              user_id: waNum.user_id,
              wa_message_id: msg.id,
              direction: 'inbound',
              from_phone: from,
              body_preview: body.substring(0, 120),
              status: 'replied',
              ts: new Date().toISOString(),
            });

            // Update replied count on most recent campaign message to this number
            const { data: lastMsg } = await supabase
              .from('wa_messages')
              .select('id, campaign_id')
              .eq('user_id', waNum.user_id)
              .eq('to_phone', from)
              .eq('direction', 'outbound')
              .order('ts', { ascending: false })
              .limit(1)
              .single();

            if (lastMsg?.campaign_id) {
              await updateCampaignStats(supabase, lastMsg.campaign_id, 'replied', 0);
            }
          }
        }
      }
    }
  } catch (err) {
    console.error('wa-webhook error:', err);
  }

  // Always return 200 to Meta or it will retry
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

  // Increment counter + add cost via raw SQL increment
  const { data: camp } = await supabase
    .from('wa_campaigns').select(col + ', total_cost').eq('id', campaignId).single();
  if (camp) {
    await supabase.from('wa_campaigns').update({
      [col]: (camp[col] ?? 0) + 1,
      total_cost: (Number(camp.total_cost) + cost).toFixed(4),
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId);
  }
}
