import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

function escapeHtml(str: unknown): string {
  if (str === null || str === undefined) return '';
  const s = String(str);
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

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

    // 1. Fetch bot to identify owner user_id & bot name
    const { data: bot, error: botError } = await supabase
      .from('bots')
      .select('id, user_id, name, leads_count')
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
    const cleanEmail = email.trim().toLowerCase();
    const cleanName = name?.trim() || null;
    const cleanPhone = phone?.trim() || null;

    const { data: lead, error: insertError } = await supabase
      .from('leads')
      .insert({
        bot_id: bot.id,
        user_id: bot.user_id,
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        score: Math.min(score, 100),
        score_reason: cleanPhone ? 'Provided direct phone number & email' : 'Provided verified email',
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

    // 6. Email notification dispatch via Resend
    // Requirement 3: "For widget leads belonging to customers: email the CUSTOMER (bot owner), not support@. Only EmbedEase's own site forms go to support@embedease.in."
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    if (resendApiKey) {
      try {
        let recipientEmail = 'support@embedease.in';
        let recipientLabel = 'EmbedEase Support';

        // Check if bot belongs to an EmbedEase customer
        if (bot_id !== 'embedease-production-bot' && bot.user_id) {
          const { data: ownerData } = await supabase.auth.admin.getUserById(bot.user_id);
          if (ownerData?.user?.email) {
            recipientEmail = ownerData.user.email;
            recipientLabel = 'Bot Owner';
          }
        }

        const formattedDate = new Date().toLocaleString('en-IN', {
          timeZone: 'Asia/Kolkata',
          dateStyle: 'full',
          timeStyle: 'medium',
        });

        const escName = escapeHtml(cleanName || 'Not provided');
        const escEmail = escapeHtml(cleanEmail);
        const escPhone = escapeHtml(cleanPhone || 'Not provided');
        const escBot = escapeHtml(bot.name || 'Chatbot');
        const escPage = escapeHtml(source_page || 'Website');
        const escChannel = escapeHtml(channel);
        const escUtmSource = escapeHtml(utm_source || 'direct');
        const escUtmCampaign = escapeHtml(utm_campaign || 'none');

        const html = `
<!DOCTYPE html>
<html>
<body style="font-family:-apple-system,BlinkMacSystemFont,Roboto,Helvetica,Arial,sans-serif;background-color:#F6F4EF;margin:0;padding:24px;color:#0F1210;">
  <div style="max-width:580px;margin:0 auto;background:#FFFFFF;border:1px solid #E2DED4;border-radius:8px;overflow:hidden;">
    <div style="background:#0E6B4D;padding:18px 22px;color:#FFFFFF;">
      <h2 style="margin:0;font-size:18px;font-weight:600;">🎉 New Lead Captured: ${escBot}</h2>
      <p style="margin:4px 0 0;font-size:12px;opacity:0.9;">EmbedEase Lead Alert &bull; ${formattedDate} IST</p>
    </div>
    <div style="padding:22px;">
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:16px;">
        <tr>
          <td style="padding:6px 0;width:110px;color:#6B7570;"><strong>Name:</strong></td>
          <td style="padding:6px 0;color:#0F1210;font-weight:600;">${escName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Email:</strong></td>
          <td style="padding:6px 0;"><a href="mailto:${escEmail}" style="color:#0E6B4D;text-decoration:none;font-weight:600;">${escEmail}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Phone:</strong></td>
          <td style="padding:6px 0;"><a href="tel:${escPhone}" style="color:#0F1210;text-decoration:none;">${escPhone}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Lead Score:</strong></td>
          <td style="padding:6px 0;"><span style="background:#E0A526;color:#0F1210;padding:2px 8px;border-radius:4px;font-size:12px;font-weight:700;">${score}/100</span></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Channel:</strong></td>
          <td style="padding:6px 0;color:#0F1210;">${escChannel} (Source: ${escUtmSource})</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Campaign:</strong></td>
          <td style="padding:6px 0;color:#0F1210;">${escUtmCampaign}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Page URL:</strong></td>
          <td style="padding:6px 0;"><a href="${escPage}" style="color:#0E6B4D;word-break:break-all;">${escPage}</a></td>
        </tr>
      </table>
    </div>
    <div style="background:#FAF8F5;border-top:1px solid #E2DED4;padding:12px 22px;font-size:12px;color:#8F9994;text-align:center;">
      Dispatched via EmbedEase Lead Intelligence &bull; Reply to contact visitor
    </div>
  </div>
</body>
</html>`;

        await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: 'EmbedEase <no-reply@embedease.in>',
            to: [recipientEmail],
            reply_to: cleanEmail,
            subject: `[Lead Alert] ${cleanName || cleanEmail} via ${bot.name}`,
            html: html,
            text: `New Lead Captured:\nName: ${cleanName || 'Not provided'}\nEmail: ${cleanEmail}\nPhone: ${cleanPhone || 'Not provided'}\nBot: ${bot.name}\nSource Page: ${source_page}\nChannel: ${channel}\nScore: ${score}/100`,
          }),
        });
      } catch (emailErr) {
        console.error('Lead email notification dispatch failed:', emailErr);
      }
    }

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
