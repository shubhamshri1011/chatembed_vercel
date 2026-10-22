import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

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

    const body = await req.json();
    const action = body.action || 'create';

    // 1. Fetch user's WhatsApp number + access token securely via service role
    const { data: waNumber, error: numErr } = await supabase
      .from('wa_numbers')
      .select('*')
      .eq('user_id', user.id)
      .eq('status', 'active')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (numErr || !waNumber) {
      return new Response(JSON.stringify({ error: 'No active WhatsApp number connected. Connect a number first.' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // ── Action: CREATE TEMPLATE ON META ──
    if (action === 'create') {
      const { name, category, language, components } = body;
      if (!name || !category || !language || !components) {
        return new Response(JSON.stringify({ error: 'name, category, language, and components are required' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const formattedName = name.toLowerCase().replace(/[^a-z0-9_]/g, '_');

      // Submit to Meta Graph API
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${waNumber.waba_id}/message_templates`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${waNumber.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            name: formattedName,
            category,
            language,
            components,
          }),
        }
      );

      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        return new Response(
          JSON.stringify({
            error: `Meta Template Rejection: ${metaData.error?.message || 'Failed to create template on Meta'}`,
            meta_details: metaData.error,
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Save to wa_templates
      const { data: tmpl, error: insErr } = await supabase
        .from('wa_templates')
        .insert({
          user_id: user.id,
          wa_number_id: waNumber.id,
          name: formattedName,
          category,
          language,
          components,
          meta_template_id: metaData.id,
          status: metaData.status || 'PENDING',
        })
        .select()
        .single();

      if (insErr) {
        return new Response(JSON.stringify({ error: insErr.message }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      return new Response(
        JSON.stringify({ status: 'success', template: tmpl }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ── Action: SYNC STATUS WITH META ──
    if (action === 'sync') {
      const metaRes = await fetch(
        `https://graph.facebook.com/v21.0/${waNumber.waba_id}/message_templates?access_token=${waNumber.access_token}&limit=100`
      );
      const metaData = await metaRes.json();
      if (!metaRes.ok) {
        return new Response(
          JSON.stringify({ error: metaData.error?.message || 'Failed to sync with Meta' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const metaList = metaData.data || [];
      let updatedCount = 0;

      for (const item of metaList) {
        const { error } = await supabase
          .from('wa_templates')
          .update({
            status: item.status,
            rejection_reason: item.rejected_reason || null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', user.id)
          .eq('name', item.name);

        if (!error) updatedCount++;
      }

      return new Response(
        JSON.stringify({ status: 'success', synced: updatedCount }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'Invalid action' }), {
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
