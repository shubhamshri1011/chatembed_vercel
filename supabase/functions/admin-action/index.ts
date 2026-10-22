import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

const PLAN_LIMITS: Record<string, number> = {
  free_trial: 100,
  starter: 1000,
  growth: 5000,
  pro: 15000,
  agency: 50000,
};

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

    // Verify admin status
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden: Admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const body = await req.json();
    const { action } = body;

    // ── Action: CHANGE USER PLAN ──
    if (action === 'change_plan') {
      const { target_user_id, plan, convos_limit } = body;
      if (!target_user_id || !plan) {
        return new Response(JSON.stringify({ error: 'target_user_id and plan required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const limit = convos_limit || PLAN_LIMITS[plan.toLowerCase()] || 1000;

      const { data: updated, error: updErr } = await supabase
        .from('profiles')
        .update({
          plan,
          convos_limit: limit,
          updated_at: new Date().toISOString(),
        })
        .eq('id', target_user_id)
        .select()
        .single();

      if (updErr) {
        return new Response(JSON.stringify({ error: updErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ status: 'success', profile: updated }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: UPDATE PARTNER STATUS ──
    if (action === 'update_partner') {
      const { partner_id, status } = body;
      if (!partner_id || !status) {
        return new Response(JSON.stringify({ error: 'partner_id and status required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: updatedPartner, error: pErr } = await supabase
        .from('partners')
        .update({
          status,
          approved_at: status === 'active' ? new Date().toISOString() : null,
          approved_by: status === 'active' ? user.id : null,
        })
        .eq('id', partner_id)
        .select()
        .single();

      if (pErr) {
        return new Response(JSON.stringify({ error: pErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ status: 'success', partner: updatedPartner }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid admin action' }), {
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
