import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { corsHeaders } from '../_shared/cors.ts';

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL') ?? '',
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
  );

  try {
    const authHeader = req.headers.get('Authorization') ?? '';
    const { data: { user }, error } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
    if (error || !user) return json({ error: 'Unauthorized' }, 401);

    const body = await req.json();
    const { business_name, contact_phone, message, ref_code_requested } = body;

    if (!business_name) return json({ error: 'business_name required' }, 400);

    // Sanitise and generate unique ref_code from business name
    const baseCode = ref_code_requested
      ? ref_code_requested.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 12)
      : business_name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 8);

    const suffix = Math.random().toString(36).substring(2, 5).toUpperCase();
    const refCode = `${baseCode}${suffix}`;

    // Check if user already applied
    const { data: existing } = await supabase.from('partners').select('id').eq('user_id', user.id).single();
    if (existing) return json({ error: 'You have already applied for the partner program.', status: 'already_applied' }, 409);

    // Insert partner application (status: pending)
    const { data: partner, error: insertErr } = await supabase.from('partners').insert({
      user_id: user.id,
      business_name,
      contact_phone: contact_phone ?? null,
      ref_code: refCode,
      status: 'pending',
    }).select().single();

    if (insertErr) {
      console.error('partner insert error:', insertErr);
      return json({ error: 'Failed to submit application. Please try again.' }, 500);
    }

    // Notify admin via Resend
    const resendKey = Deno.env.get('RESEND_API_KEY');
    if (resendKey) {
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'EmbedEase Partners <no-reply@embedease.in>',
          to: ['support@embedease.in'],
          subject: `[Partner Application] ${business_name}`,
          text: [
            `New partner application received.`,
            `Business: ${business_name}`,
            `Phone: ${contact_phone ?? 'N/A'}`,
            `Email: ${user.email}`,
            `Ref Code (auto): ${refCode}`,
            `Message: ${message ?? 'N/A'}`,
            `Partner ID: ${partner.id}`,
            `Review at: https://embedease.in/app#admin`,
          ].join('\n'),
        }),
      });
    }

    return json({
      success: true,
      ref_code: refCode,
      message: 'Application submitted! We will review and contact you within 24 hours.',
    });

  } catch (err) {
    console.error('partner-apply error:', err);
    return json({ error: 'Internal error' }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}
