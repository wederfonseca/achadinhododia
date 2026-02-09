import { getStore } from "@netlify/blobs";

/**
 * Edge function: recebe POST do browser com:
 * { event_name, event_id, event_source_url, fbp, fbc, custom_data }
 *
 * Faz:
 * - deduplicação por event_id (diária)
 * - contador diário (Blobs)
 * - envio para Meta CAPI (Graph API)
 * - log limpo: [CAPI] YYYY-MM-DD HH:MM:SS click# N event_id=... status=...
 */

export default async (request) => {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.event_id) {
      return new Response(JSON.stringify({ ok:false, error: 'missing_event_id' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }

    // date no fuso do Brasil (YYYY-MM-DD)
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); // en-CA -> YYYY-MM-DD

    const store = getStore("group-join-counter"); // nome do store (pode ser qualquer string)
    const eventsKey = `events:${today}`; // array de event_ids processados
    const countKey = `count:${today}`;   // contador numérico

    // buscar lista de event_ids já processados
    const seen = (await store.getJSON(eventsKey)) || [];

    // se já processado, não conta de novo nem reenvia (dedupe estrita)
    if (seen.includes(body.event_id)) {
      const currentCount = (await store.getJSON(countKey)) || 0;
      // log para auditoria
      console.log(`[CAPI] ${today} (duplicate) event_id=${body.event_id} count=${currentCount}`);
      return new Response(JSON.stringify({ ok:true, duplicate:true, count: currentCount }), { headers: { 'Content-Type': 'application/json' }});
    }

    // marca como processado
    seen.push(body.event_id);
    await store.setJSON(eventsKey, seen);

    // incrementa contador diário
    const current = (await store.getJSON(countKey)) || 0;
    const next = current + 1;
    await store.setJSON(countKey, next);

    // monta dados do CAPI
    // variáveis de ambiente no Edge: use Netlify.env.get()
    const pixelId = Netlify?.env?.get("META_PIXEL_ID") || null;
    const accessToken = Netlify?.env?.get("META_ACCESS_TOKEN") || null;

    if (!pixelId || !accessToken) {
      console.error('[CAPI] missing META_PIXEL_ID or META_ACCESS_TOKEN');
      // respondemos OK (para não quebrar UX), mas logamos erro para correção
      return new Response(JSON.stringify({ ok:false, error:'missing_env_vars' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const userData = {
      client_ip_address: request.headers.get('x-nf-client-connection-ip') || request.headers.get('x-forwarded-for') || null,
      client_user_agent: request.headers.get('user-agent') || null
    };

    if (body.fbp) userData.fbp = body.fbp;
    if (body.fbc) userData.fbc = body.fbc;

    const capiPayload = {
      data: [
        {
          event_name: body.event_name || 'GroupJoinIntent',
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url || '',
          action_source: 'website',
          user_data: userData,
          custom_data: body.custom_data || {}
        }
      ]
      // test_event_code: "TEST9384" // descomente apenas para debug/testes
    };

    // envia para Meta
    let respStatus = null;
    try {
      const res = await fetch(`https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(capiPayload)
      });
      respStatus = res.status;
      // opcional: ler body apenas se quiser debug
      // const text = await res.text();
      console.log(`[CAPI] ${today} click#${next} event_id=${body.event_id} status=${respStatus}`);
    } catch (err) {
      console.error('[CAPI] send error', err);
      // não revertemos o contador — preferível evitar undercounting por retry complexities
    }

    return new Response(JSON.stringify({ ok:true, count: next, status: respStatus }), { headers: { 'Content-Type': 'application/json' }});
  } catch (err) {
    console.error('collect handler error', err);
    return new Response(JSON.stringify({ ok:false, error: String(err) }), { status: 500, headers: { 'Content-Type': 'application/json' }});
  }
};
