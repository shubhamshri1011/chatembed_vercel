import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const {
      bot_id,
      name,
      email,
      phone,
      session_id,
      source_page,
      utm_source,
      utm_medium,
      utm_campaign,
      utm_content,
      utm_term,
      gclid,
      fbclid,
      ctwa_clid,
      first_touch = {},
      last_touch = {},
      consent = true,
      notes,
    } = body;

    if (!bot_id || !email) {
      return new Response(JSON.stringify({ error: 'bot_id and email are required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 1. Fetch bot to identify owner user_id
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('id, user_id, leads_count')
      .eq('id', bot_id)
      .single();

    if (botError || !bot) {
      return new Response(JSON.stringify({ error: 'Bot not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 2. Derive channel from UTM or click IDs
    let channel = 'website';
    if (gclid || utm_source === 'google') channel = 'google_ads';
    else if (fbclid || utm_source === 'facebook' || utm_source === 'meta' || utm_source === 'instagram') channel = 'meta';
    else if (ctwa_clid || utm_source === 'whatsapp') channel = 'whatsapp';
    else if (utm_source === 'hotstar') channel = 'hotstar';

    // 3. Compute initial lead intent score
    let score = 50;
    if (phone) score += 20;
    if (name) score += 10;
    if (utm_campaign) score += 10;

    // 4. Insert lead with full attribution
    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        bot_id: bot.id,
        user_id: bot.user_id,
        name: name?.trim() || null,
        email: email.trim().toLowerCase(),
        phone: phone?.trim() || null,
        score: Math.min(score, 100),
        score_reason: phone ? 'Provided direct phone number & email' : 'Provided verified email',
        status: 'new',
        stage: 'new',
        channel: channel,
        source_page: source_page || null,
        utm_source: utm_source || null,
        utm_medium: utm_medium || null,
        utm_campaign: utm_campaign || null,
        utm_content: utm_content || null,
        utm_term: utm_term || null,
        gclid: gclid || null,
        fbclid: fbclid || null,
        ctwa_clid: ctwa_clid || null,
        first_touch: first_touch || {},
        last_touch: last_touch || {},
        session_id: session_id || null,
        consent: Boolean(consent),
        notes: notes || null,
      })
      .select('id')
      .single();

    if (insertError) {
      return new Response(JSON.stringify({ error: insertError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // 5. Increment bot leads_count & emit event
    await Promise.allSettled([
      supabase
        .from('bots')
        .update({ leads_count: (bot.leads_count || 0) + 1 })
        .eq('id', bot.id),

      supabase.from('events').insert({
        bot_id: bot.id,
        session_id: session_id || null,
        lead_id: lead?.id,
        name: 'lead_submitted',
        page_url: source_page,
        props: { channel, score },
      }),
    ]);

    return new Response(JSON.stringify({ success: true, lead_id: lead?.id }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
