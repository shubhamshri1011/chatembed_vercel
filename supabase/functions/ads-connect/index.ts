import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

// Feature Flag: Google Ads developer token status
const GOOGLE_ADS_SYNC_ENABLED = false;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
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
    const { platform, account_id, access_token, account_name } = body;

    if (!platform || !account_id) {
      return new Response(JSON.stringify({ error: 'platform and account_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── 1. Google Ads Feature Flag Check ────────────────────────
    if (platform === 'google_ads') {
      if (!GOOGLE_ADS_SYNC_ENABLED) {
        return new Response(
          JSON.stringify({
            status: 'feature_flagged',
            message: 'Google Ads API sync is scaffolded and awaiting developer token approval. Please use CSV Import for Google Ads reports in the interim.',
          }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // ── 2. Meta Marketing API Verification (ads_read) ───────────
    if (platform === 'meta') {
      if (!access_token) {
        return new Response(JSON.stringify({ error: 'access_token required for Meta Ad Account' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      // Format account id (e.g. act_12345678)
      const cleanId = account_id.startsWith('act_') ? account_id : `act_${account_id.replace(/[^0-9]/g, '')}`;

      // Verify token and account access on Meta
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${cleanId}?fields=id,name,account_status,currency&access_token=${access_token}`
      );
      const metaData = await metaRes.json();

      if (!metaRes.ok || metaData.error) {
        return new Response(
          JSON.stringify({
            error: `Meta Ads API Error: ${metaData.error?.message || 'Failed to verify ad account'}`
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const verifiedName = metaData.name || account_name || `Meta Ad Account ${cleanId}`;

      // Store server-side only via service role
      const { data: acc, error: dbErr } = await supabase
        .from('ad_accounts')
        .upsert({
          user_id: user.id,
          platform: 'meta',
          account_id: cleanId,
          account_name: verifiedName,
          access_token: access_token,
          status: 'active',
          meta: { currency: metaData.currency, account_status: metaData.account_status },
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,platform,account_id' })
        .select('id, platform, account_id, account_name, status, last_synced_at')
        .single();

      if (dbErr) {
        return new Response(JSON.stringify({ error: dbErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({
          status: 'success',
          account: acc,
          message: `Connected Meta Ad Account '${verifiedName}' successfully!`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Unsupported platform' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
