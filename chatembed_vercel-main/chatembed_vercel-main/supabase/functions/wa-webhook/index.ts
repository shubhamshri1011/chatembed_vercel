import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Meta India Estimated Rate Card (per conversation/message category in INR)
const META_INDIA_RATES: Record<string, number> = {
  marketing: 0.78,
  utility: 0.31,
  authentication: 0.14,
  service: 0.29,
};

serve(async (req) => {
  const url = new URL(req.url);

  // 1. Meta Webhook Verification Challenge (GET)
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge');
    const verifyToken = Deno.env.get('WHATSAPP_WEBHOOK_VERIFY_TOKEN') || 'embedease_wa_verify_2026';

    if (mode === 'subscribe' && token === verifyToken) {
      return new Response(challenge, { status: 200 });
    }
    return new Response('Forbidden', { status: 403 });
  }

  // 2. Incoming Event Processing (POST)
  if (req.method === 'POST') {
    try {
      const payload = await req.json();
      const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      const entry = payload.entry?.[0];
      const changes = entry?.changes?.[0]?.value;

      // Handle Message Status updates (sent, delivered, read, failed)
      if (changes?.statuses && Array.isArray(changes.statuses)) {
        for (const st of changes.statuses) {
          const waMsgId = st.id;
          const status = st.status; // 'delivered', 'read', 'failed', 'sent'
          const pricing = st.pricing;
          const category = pricing?.category || 'marketing';
          const billable = pricing?.billable ?? true;
          const estimatedCost = billable ? (META_INDIA_RATES[category] || 0.78) : 0.0;

          await supabase
            .from('wa_messages')
            .update({
              status: status,
              category: category,
              billable: billable,
              cost: estimatedCost,
            })
            .eq('wa_message_id', waMsgId);
        }
      }

      // Handle Incoming Messages (replies or opt-outs)
      if (changes?.messages && Array.isArray(changes.messages)) {
        for (const msg of changes.messages) {
          const fromPhone = msg.from;
          const text = msg.text?.body?.trim().toUpperCase();

          // Compliance: Handle STOP opt-out
          if (text === 'STOP' || text === 'UNSUBSCRIBE') {
            await supabase
              .from('leads')
              .update({ consent: false, notes: 'Opted out via WhatsApp STOP command' })
              .eq('phone', fromPhone);
          }
        }
      }

      return new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err: any) {
      return new Response(JSON.stringify({ error: err.message }), { status: 500 });
    }
  }

  return new Response('Method Not Allowed', { status: 405 });
});
