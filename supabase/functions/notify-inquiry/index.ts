import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

// In-memory rate limiting map: ip -> timestamps[]
const rateLimitMap = new Map<string, number[]>();
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000; // 10 minutes
const MAX_REQUESTS_PER_WINDOW = 6; // max 6 submissions per 10 min

function isRateLimited(ip: string): boolean {
  if (!ip || ip === 'unknown') return false;
  const now = Date.now();
  const timestamps = rateLimitMap.get(ip) || [];
  const validTimestamps = timestamps.filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  if (validTimestamps.length >= MAX_REQUESTS_PER_WINDOW) {
    return true;
  }
  validTimestamps.push(now);
  rateLimitMap.set(ip, validTimestamps);
  return false;
}

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

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('cf-connecting-ip') ||
      'unknown';

    // 1. Rate limiting check
    if (isRateLimited(clientIp)) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded. Please try again later or email support@embedease.in.',
        }),
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const body = await req.json().catch(() => ({}));
    const {
      form_name = 'website_contact',
      name = '',
      email = '',
      phone = '',
      company = '',
      message = '',
      needs = '',
      page_url = '',
      utm_source = '',
      utm_medium = '',
      utm_campaign = '',
      utm_term = '',
      utm_content = '',
      gclid = '',
      fbclid = '',
      ctwa_clid = '',
      website_hp = '', // honeypot 1
      hp = '',         // honeypot 2
      _hp = '',        // honeypot 3
      extra_fields = {},
    } = body;

    // 2. Honeypot check: If any honeypot is populated, bot detected
    if (website_hp || hp || _hp) {
      console.warn(`Honeypot triggered from IP ${clientIp}. Silently dropping.`);
      return new Response(
        JSON.stringify({ success: true, message: 'Inquiry received' }),
        {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // 3. Server-side validation
    const cleanEmail = String(email || '').trim().toLowerCase();
    if (!cleanEmail || !isValidEmail(cleanEmail)) {
      return new Response(
        JSON.stringify({
          error: 'A valid email address is required. Fallback: email support@embedease.in',
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const cleanName = String(name || '').trim().slice(0, 150);
    const cleanPhone = String(phone || '').trim().slice(0, 30);
    const cleanCompany = String(company || '').trim().slice(0, 150);
    const cleanMessage = String(message || needs || '').trim().slice(0, 5000);
    const cleanFormName = String(form_name || 'inquiry').trim().slice(0, 80);
    const cleanPageUrl = String(page_url || req.headers.get('referer') || '').slice(0, 500);

    // 4. Save to Supabase (inquiries table and/or leads table)
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    let supabaseRecordId = null;

    if (supabaseUrl && supabaseServiceKey) {
      try {
        const supabase = createClient(supabaseUrl, supabaseServiceKey);

        // Attempt insert into inquiries
        const { data: inquiryData, error: inqError } = await supabase
          .from('inquiries')
          .insert({
            form_name: cleanFormName,
            name: cleanName || null,
            email: cleanEmail,
            phone: cleanPhone || null,
            company: cleanCompany || null,
            message: cleanMessage || null,
            fields: { ...extra_fields, raw_needs: needs },
            page_url: cleanPageUrl || null,
            utm_source: utm_source || null,
            utm_medium: utm_medium || null,
            utm_campaign: utm_campaign || null,
            utm_term: utm_term || null,
            utm_content: utm_content || null,
            gclid: gclid || null,
            fbclid: fbclid || null,
            ctwa_clid: ctwa_clid || null,
            ip_address: clientIp,
            user_agent: req.headers.get('user-agent')?.slice(0, 300) || null,
            status: 'new',
          })
          .select('id')
          .single();

        if (!inqError && inquiryData) {
          supabaseRecordId = inquiryData.id;
        } else if (inqError) {
          console.warn('Inquiries table insert notice:', inqError.message);
          // Fallback log to events table if inquiries table does not exist
          await supabase.from('events').insert({
            name: 'site_inquiry_fallback',
            page_url: cleanPageUrl,
            props: {
              form_name: cleanFormName,
              email: cleanEmail,
              name: cleanName,
              phone: cleanPhone,
              message: cleanMessage,
            },
          });
        }
      } catch (dbErr) {
        console.error('Supabase save error:', dbErr);
      }
    }

    // 5. Send notification email via Resend
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const toEmail = 'support@embedease.in';
    const timestamp = new Date().toISOString();
    const formattedDate = new Date().toLocaleString('en-IN', {
      timeZone: 'Asia/Kolkata',
      dateStyle: 'full',
      timeStyle: 'medium',
    });

    if (resendApiKey) {
      // Build safe escaped HTML body
      const escapedFormName = escapeHtml(cleanFormName);
      const escapedName = escapeHtml(cleanName || 'Not provided');
      const escapedEmail = escapeHtml(cleanEmail);
      const escapedPhone = escapeHtml(cleanPhone || 'Not provided');
      const escapedCompany = escapeHtml(cleanCompany || 'Not provided');
      const escapedMessage = escapeHtml(cleanMessage || 'None');
      const escapedPageUrl = escapeHtml(cleanPageUrl || 'Direct / Unknown');
      const escapedUtmSource = escapeHtml(utm_source || 'direct');
      const escapedUtmMedium = escapeHtml(utm_medium || 'none');
      const escapedUtmCampaign = escapeHtml(utm_campaign || 'none');
      const escapedGclid = escapeHtml(gclid || 'none');
      const escapedFbclid = escapeHtml(fbclid || 'none');
      const escapedIp = escapeHtml(clientIp);

      const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>New EmbedEase Inquiry</title>
</head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background-color:#F6F4EF;margin:0;padding:24px;color:#0F1210;">
  <div style="max-width:600px;margin:0 auto;background:#FFFFFF;border:1px solid #E2DED4;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
    <div style="background:#0E6B4D;padding:20px 24px;color:#FFFFFF;">
      <h2 style="margin:0;font-size:20px;font-weight:600;">New Inquiry: ${escapedFormName}</h2>
      <p style="margin:4px 0 0;font-size:13px;opacity:0.9;">EmbedEase Lead Notification &bull; ${formattedDate} IST</p>
    </div>
    
    <div style="padding:24px;">
      <h3 style="margin-top:0;font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#6B7570;border-bottom:1px solid #EFECE6;padding-bottom:8px;">Contact Information</h3>
      <table style="width:100%;border-collapse:collapse;font-size:14px;margin-bottom:20px;">
        <tr>
          <td style="padding:6px 0;width:120px;color:#6B7570;"><strong>Name:</strong></td>
          <td style="padding:6px 0;color:#0F1210;">${escapedName}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Email:</strong></td>
          <td style="padding:6px 0;"><a href="mailto:${escapedEmail}" style="color:#0E6B4D;text-decoration:none;font-weight:600;">${escapedEmail}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Phone:</strong></td>
          <td style="padding:6px 0;"><a href="tel:${escapedPhone}" style="color:#0F1210;text-decoration:none;">${escapedPhone}</a></td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#6B7570;"><strong>Company:</strong></td>
          <td style="padding:6px 0;color:#0F1210;">${escapedCompany}</td>
        </tr>
      </table>

      <h3 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#6B7570;border-bottom:1px solid #EFECE6;padding-bottom:8px;">Requirement / Message</h3>
      <div style="background:#F6F4EF;border-left:4px solid #0E6B4D;padding:14px 16px;border-radius:4px;font-size:14px;line-height:1.6;margin-bottom:24px;white-space:pre-wrap;color:#0F1210;">${escapedMessage}</div>

      <h3 style="font-size:15px;text-transform:uppercase;letter-spacing:0.5px;color:#6B7570;border-bottom:1px solid #EFECE6;padding-bottom:8px;">Attribution & Origin</h3>
      <table style="width:100%;border-collapse:collapse;font-size:13px;color:#555E5A;">
        <tr>
          <td style="padding:4px 0;width:130px;"><strong>Page URL:</strong></td>
          <td style="padding:4px 0;"><a href="${escapedPageUrl}" style="color:#0E6B4D;word-break:break-all;">${escapedPageUrl}</a></td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>UTM Source:</strong></td>
          <td style="padding:4px 0;">${escapedUtmSource} / ${escapedUtmMedium}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>UTM Campaign:</strong></td>
          <td style="padding:4px 0;">${escapedUtmCampaign}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Ad Click IDs:</strong></td>
          <td style="padding:4px 0;">GCLID: ${escapedGclid} | FBCLID: ${escapedFbclid}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Client IP:</strong></td>
          <td style="padding:4px 0;">${escapedIp}</td>
        </tr>
        <tr>
          <td style="padding:4px 0;"><strong>Timestamp:</strong></td>
          <td style="padding:4px 0;">${timestamp}</td>
        </tr>
      </table>
    </div>

    <div style="background:#FAF8F5;border-top:1px solid #E2DED4;padding:14px 24px;font-size:12px;color:#8F9994;text-align:center;">
      Reply directly to this email to respond to <strong>${escapedEmail}</strong>.<br>
      EmbedEase &bull; Roopya Technologies &bull; support@embedease.in
    </div>
  </div>
</body>
</html>
      `;

      const textContent = `
NEW INQUIRY: ${cleanFormName}
==================================================
Date: ${formattedDate} IST
Form: ${cleanFormName}
Name: ${cleanName || 'Not provided'}
Email: ${cleanEmail}
Phone: ${cleanPhone || 'Not provided'}
Company: ${cleanCompany || 'Not provided'}

MESSAGE:
${cleanMessage || 'None'}

ATTRIBUTION & ORIGIN:
Page: ${cleanPageUrl}
UTM Source: ${utm_source || 'direct'} / ${utm_medium || 'none'}
UTM Campaign: ${utm_campaign || 'none'}
Click IDs: GCLID: ${gclid || 'none'} | FBCLID: ${fbclid || 'none'}
Client IP: ${clientIp}
Timestamp: ${timestamp}
Reply directly to this email to contact the lead.
      `.trim();

      const resendPayload = {
        from: 'EmbedEase <no-reply@embedease.in>',
        to: [toEmail],
        reply_to: cleanEmail,
        subject: `[EmbedEase Inquiry] ${cleanFormName} - ${cleanName || cleanEmail}`,
        html: htmlContent,
        text: textContent,
      };

      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${resendApiKey}`,
        },
        body: JSON.stringify(resendPayload),
      });

      if (!resendRes.ok) {
        const errorText = await resendRes.text();
        console.error('Resend delivery failure:', resendRes.status, errorText);
      } else {
        console.log(`Notification email sent via Resend for ${cleanEmail}`);
      }
    } else {
      console.warn('RESEND_API_KEY not configured in Supabase secrets. Email skipped.');
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Inquiry saved and notification dispatched',
        inquiry_id: supabaseRecordId,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    console.error('notify-inquiry unexpected error:', err);
    return new Response(
      JSON.stringify({
        error: err.message || 'Internal server error',
        fallback: 'Please email support@embedease.in directly.',
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
