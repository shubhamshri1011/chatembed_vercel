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
    const { bot_id, knowledge_text, website_url } = body;

    if (!bot_id) {
      return new Response(JSON.stringify({ error: 'bot_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let aggregatedContent = knowledge_text || '';

    // If a website URL is provided, attempt light content fetch
    if (website_url) {
      try {
        const urlToFetch = website_url.startsWith('http') ? website_url : `https://${website_url}`;
        const pageRes = await fetch(urlToFetch, { headers: { 'User-Agent': 'EmbedEase-Crawler/1.0' } });
        if (pageRes.ok) {
          const html = await pageRes.text();
          // Extract text content cleanly (strip tags and extra whitespace)
          const textOnly = html
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 10000); // limit to first 10k chars

          aggregatedContent = `${aggregatedContent}\n\n[Website Content from ${website_url}]:\n${textOnly}`.trim();
        }
      } catch (e) {
        console.warn('Failed to crawl URL:', e);
      }
    }

    // Update bot record
    const { error: updateError } = await supabase
      .from('bots')
      .update({
        knowledge_base: aggregatedContent,
        training_status: 'trained',
        trained_at: new Date().toISOString(),
      })
      .eq('id', bot_id);

    if (updateError) {
      return new Response(JSON.stringify({ error: updateError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Chunk text (approx 500 words each) into bot_knowledge
    if (aggregatedContent) {
      const chunks = aggregatedContent
        .split(/\n\n+/)
        .map((c: string) => c.trim())
        .filter((c: string) => c.length > 30);

      // Delete old chunks
      await supabase.from('bot_knowledge').delete().eq('bot_id', bot_id);

      // Insert new chunks
      if (chunks.length > 0) {
        const chunkRows = chunks.slice(0, 20).map((chunk: string) => ({
          bot_id,
          content: chunk,
        }));
        await supabase.from('bot_knowledge').insert(chunkRows);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: 'Knowledge base updated and trained successfully.',
        training_status: 'trained',
      }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message || 'Training failed' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
