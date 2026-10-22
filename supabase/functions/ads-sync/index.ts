import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const GOOGLE_ADS_SYNC_ENABLED = false;

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey  = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabase    = createClient(supabaseUrl, serviceKey);

  try {
    let targetUserId: string | null = null;

    // Check if triggered by user (JWT) or cron (service role/cron secret)
    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace('Bearer ', '');

    if (token) {
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) targetUserId = user.id;
    }

    // Query active ad accounts
    let query = supabase.from('ad_accounts').select('*').eq('status', 'active');
    if (targetUserId) {
      query = query.eq('user_id', targetUserId);
    }
    const { data: accounts, error: accErr } = await query;

    if (accErr) {
      return new Response(JSON.stringify({ error: accErr.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!accounts || accounts.length === 0) {
      return new Response(
        JSON.stringify({
          status: 'no_accounts',
          message: 'No active ad accounts found to sync. Connect an ad account first.'
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let totalSyncedRows = 0;
    const syncResults: any[] = [];

    for (const acc of accounts) {
      if (acc.platform === 'google_ads') {
        if (!GOOGLE_ADS_SYNC_ENABLED) {
          syncResults.push({
            account: acc.account_name,
            platform: 'google_ads',
            status: 'scaffolding_only',
            message: 'Awaiting developer token approval',
          });
          continue;
        }
      }

      if (acc.platform === 'meta') {
        try {
          // Fetch insights for last 7 days broken down by day and campaign
          const cleanId = acc.account_id.startsWith('act_') ? acc.account_id : `act_${acc.account_id}`;
          const insightsUrl = `https://graph.facebook.com/v21.0/${cleanId}/insights?level=campaign&fields=campaign_name,spend,impressions,clicks,date_start&date_preset=last_7d&time_increment=1&limit=500&access_token=${acc.access_token}`;

          const res = await fetch(insightsUrl);
          const data = await res.json();

          if (!res.ok || data.error) {
            console.error('Meta Insights API error:', data.error);
            syncResults.push({
              account: acc.account_name,
              platform: 'meta',
              status: 'error',
              error: data.error?.message,
            });
            continue;
          }

          const rows = data.data || [];
          let syncedCount = 0;

          for (const row of rows) {
            const campName = row.campaign_name || 'Unnamed Meta Campaign';
            const spendDate = row.date_start; // YYYY-MM-DD
            const spendAmount = Number(row.spend || 0);
            const impressions = Number(row.impressions || 0);
            const clicks = Number(row.clicks || 0);

            // 1. Ensure campaign exists (deduped by user_id, channel, name)
            const { data: camp, error: campErr } = await supabase
              .from('campaigns')
              .upsert({
                user_id: acc.user_id,
                channel: 'meta',
                name: campName,
                status: 'active',
              }, { onConflict: 'user_id,channel,name' })
              .select('id')
              .single();

            if (camp?.id && spendDate) {
              // 2. Upsert daily ad spend row (deduped on campaign_id, date)
              const { error: spendErr } = await supabase
                .from('ad_spend')
                .upsert({
                  campaign_id: camp.id,
                  user_id: acc.user_id,
                  date: spendDate,
                  spend: spendAmount,
                  impressions: impressions,
                  clicks: clicks,
                  source: 'api',
                }, { onConflict: 'campaign_id,date' });

              if (!spendErr) syncedCount++;
            }
          }

          // Update last_synced_at
          await supabase.from('ad_accounts')
            .update({ last_synced_at: new Date().toISOString() })
            .eq('id', acc.id);

          totalSyncedRows += syncedCount;
          syncResults.push({
            account: acc.account_name,
            platform: 'meta',
            status: 'success',
            synced_days: syncedCount,
          });
        } catch (e: any) {
          syncResults.push({
            account: acc.account_name,
            platform: 'meta',
            status: 'error',
            error: e.message,
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        status: 'completed',
        total_synced_rows: totalSyncedRows,
        results: syncResults,
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
