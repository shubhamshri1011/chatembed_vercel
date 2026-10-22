import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { hmac } from 'https://deno.land/x/hmac@v2.0.1/mod.ts';

const PLAN_LIMITS: Record<string, number> = {
  starter: 1000,
  growth: 5000,
  pro: 15000,
  agency: 50000,
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const webhookSecret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET') || '';
    const signature = req.headers.get('x-razorpay-signature');
    const rawBody = await req.text();

    // 1. Verify signature if secret is configured
    if (webhookSecret) {
      if (!signature) {
        return new Response(JSON.stringify({ error: 'Missing signature' }), { status: 400 });
      }
      const generatedSignature = hmac('sha256', webhookSecret, rawBody, 'utf8', 'hex');
      if (generatedSignature !== signature) {
        return new Response(JSON.stringify({ error: 'Invalid webhook signature' }), { status: 400 });
      }
    }

    const payload = JSON.parse(rawBody);
    const event = payload.event;

    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ── 2. Handle Successful Payment Events ──────────────────────
    if (event === 'payment.captured' || event === 'order.paid') {
      const paymentEntity = payload.payload?.payment?.entity;
      const notes = paymentEntity?.notes || payload.payload?.order?.entity?.notes || {};

      const userId = notes.user_id;
      const plan = notes.plan || 'starter';
      const billingType = notes.billing_type || 'monthly';
      const amountPaise = paymentEntity?.amount || 0;
      const amountRupees = Math.round(amountPaise / 100);
      const paymentId = paymentEntity?.id || `pay_${Date.now()}`;
      const orderId = paymentEntity?.order_id || null;

      if (!userId) {
        console.warn('Webhook received without user_id in notes');
        return new Response(JSON.stringify({ status: 'ignored_missing_user' }), { status: 200 });
      }

      // Record payment in public.payments
      const { data: paymentRecord, error: payError } = await supabase
        .from('payments')
        .insert({
          user_id: userId,
          razorpay_payment_id: paymentId,
          razorpay_order_id: orderId,
          plan: plan,
          billing_type: billingType,
          amount: amountRupees,
          currency: 'INR',
          status: 'success',
        })
        .select('id')
        .single();

      if (payError) {
        console.error('Error inserting payment record:', payError);
      }

      // Upgrade user profile plan & reset limits
      const convosLimit = PLAN_LIMITS[plan.toLowerCase()] || 1000;
      await supabase
        .from('profiles')
        .update({
          plan: plan,
          plan_status: 'active',
          convos_limit: convosLimit,
          convos_used: 0,
          razorpay_id: paymentId,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      // Check for partner client attribution
      const { data: partnerClient } = await supabase
        .from('partner_clients')
        .select('partner_id, partners(id, commission_rate, referral_code)')
        .or(`client_id.eq.${userId},client_user_id.eq.${userId}`)
        .maybeSingle();

      if (partnerClient && paymentRecord?.id) {
        const partner = partnerClient.partners as any;
        const rate = Number(partner?.commission_rate || 20.0);
        const commissionAmount = (amountRupees * rate) / 100;

        await supabase.from('commissions').insert({
          partner_id: partnerClient.partner_id,
          payment_id: paymentRecord.id,
          amount: commissionAmount,
          commission_amount: commissionAmount,
          subscription_amount: amountRupees,
          commission_rate: rate,
          client_user_id: userId,
          status: 'pending',
          created_at: new Date().toISOString(),
        });

        console.log(`Commission created: ₹${commissionAmount} for partner ${partnerClient.partner_id}`);
      }
    }

    // ── 3. Handle Refund Events (Requirement 8) ──────────────────
    if (event === 'refund.processed' || event === 'payment.refunded' || event === 'refund.created') {
      const refundEntity = payload.payload?.refund?.entity || payload.payload?.payment?.entity;
      const paymentId = refundEntity?.payment_id || refundEntity?.id;

      if (paymentId) {
        // Find payment record
        const { data: paymentRecord } = await supabase
          .from('payments')
          .select('id, user_id')
          .eq('razorpay_payment_id', paymentId)
          .maybeSingle();

        if (paymentRecord) {
          // Mark payment refunded
          await supabase.from('payments')
            .update({ status: 'refunded' })
            .eq('id', paymentRecord.id);

          // Reverse any associated commissions
          await supabase.from('commissions')
            .update({
              status: 'cancelled',
              payout_ref: 'REVERSED_DUE_TO_REFUND',
            })
            .eq('payment_id', paymentRecord.id);

          console.log(`Commission reversed on refund for payment ${paymentId}`);
        }
      }
    }

    return new Response(JSON.stringify({ status: 'success' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), { status: 500 });
  }
});
