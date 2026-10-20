import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

// Central Plan Configuration (Price in INR)
const PLAN_PRICES: Record<string, { monthly: number; annual: number; convos_limit: number }> = {
  starter: { monthly: 999, annual: 9990, convos_limit: 1000 },
  growth: { monthly: 2499, annual: 24990, convos_limit: 5000 },
  pro: { monthly: 4999, annual: 49990, convos_limit: 15000 },
  agency: { monthly: 9999, annual: 99990, convos_limit: 50000 },
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
    const razorpayKeyId = Deno.env.get('RAZORPAY_KEY_ID') ?? 'rzp_test_placeholder';
    const razorpayKeySecret = Deno.env.get('RAZORPAY_KEY_SECRET') ?? '';

    // Verify user authorization via Bearer JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid user session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { plan = 'starter', billing_type = 'monthly' } = body;

    const planConfig = PLAN_PRICES[plan.toLowerCase()];
    if (!planConfig) {
      return new Response(JSON.stringify({ error: 'Invalid plan selected' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const amountInRupees = billing_type === 'annual' ? planConfig.annual : planConfig.monthly;
    const amountInPaise = amountInRupees * 100;

    // Create Razorpay Order
    let orderData = { id: `order_mock_${Date.now()}`, amount: amountInPaise, currency: 'INR' };

    if (razorpayKeySecret) {
      const authCredentials = btoa(`${razorpayKeyId}:${razorpayKeySecret}`);
      const rzpRes = await fetch('https://api.razorpay.com/v1/orders', {
        method: 'POST',
        headers: {
          Authorization: `Basic ${authCredentials}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          amount: amountInPaise,
          currency: 'INR',
          receipt: `rcpt_${user.id.slice(0, 8)}_${Date.now()}`,
          notes: {
            user_id: user.id,
            plan: plan,
            billing_type: billing_type,
          },
        }),
      });

      if (!rzpRes.ok) {
        const errJson = await rzpRes.json();
        return new Response(JSON.stringify({ error: errJson.error?.description || 'Razorpay order creation failed' }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      orderData = await rzpRes.json();
    }

    return new Response(
      JSON.stringify({
        order_id: orderData.id,
        amount: amountInPaise,
        currency: 'INR',
        key_id: razorpayKeyId,
        plan: plan,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
