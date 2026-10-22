import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    // 1. Authenticate user
    const authHeader = req.headers.get('Authorization') ?? '';
    const jwt = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(jwt);
    if (authErr || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
        status: 405,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { phone_number_id, waba_id, display_phone, access_token } = body;

    if (!phone_number_id || !waba_id || !display_phone || !access_token) {
      return new Response(JSON.stringify({ error: 'All fields are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Validate token and phone_number_id against Meta Graph API
    let metaValid = false;
    let metaError = '';
    try {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${phone_number_id}?access_token=${access_token}`
      );
      const metaData = await metaRes.json();
      if (metaRes.ok && metaData.id) {
        metaValid = true;
      } else {
        metaError = metaData.error?.message || 'Meta verification failed';
      }
    } catch (e: any) {
      metaError = e.message;
    }

    // If Meta check fails, inform user
    if (!metaValid) {
      return new Response(
        JSON.stringify({ error: `Meta verification error: ${metaError}` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 3. Upsert into wa_numbers with service role
    const { data: numberRow, error: dbErr } = await supabase
      .from('wa_numbers')
      .upsert({
        user_id: user.id,
        phone_number_id,
        waba_id,
        display_phone,
        access_token, // securely stored, revoked from client select
        status: 'active',
        updated_at: new Date().toISOString(),
      }, { onConflict: 'phone_number_id' })
      .select('id, phone_number_id, display_phone, waba_id, status')
      .single();

    if (dbErr) {
      return new Response(JSON.stringify({ error: dbErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Never return access_token back in response
    return new Response(
      JSON.stringify({
        status: 'success',
        number: numberRow,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
