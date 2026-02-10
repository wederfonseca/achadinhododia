/**
 * Netlify Edge Function — CAPI PROFISSIONAL
 * - ENV access robusto (corrige erro META_PIXEL_ID undefined)
 * - Deduplicação real (Upstash Redis)
 * - Contador diário de cliques
 * - Proteção contra request falso
 */

export default async (request, context) => {
  try {
    /* ================= ENV SAFE ACCESS ================= */
    const env =
      context?.env ||
      (typeof Deno !== "undefined" && Deno.env?.toObject?.()) ||
      {};

    const META_PIXEL_ID = env.META_PIXEL_ID;
    const META_ACCESS_TOKEN = env.META_ACCESS_TOKEN;
    const REDIS_URL = env.UPSTASH_REDIS_REST_URL;
    const REDIS_TOKEN = env.UPSTASH_REDIS_REST_TOKEN;

    if (!META_PIXEL_ID || !META_ACCESS_TOKEN || !REDIS_URL || !REDIS_TOKEN) {
      console.error("[CAPI] missing env vars", {
        META_PIXEL_ID: !!META_PIXEL_ID,
        META_ACCESS_TOKEN: !!META_ACCESS_TOKEN,
        REDIS_URL: !!REDIS_URL,
        REDIS_TOKEN: !!REDIS_TOKEN
      });
      return new Response("Server Misconfigured", { status: 500 });
    }

    /* ================= METHOD ================= */
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    /* ================= BASIC SECURITY ================= */
    if (request.headers.get("x-capi-signature") !== "v1") {
      return new Response("Forbidden", { status: 403 });
    }

    /* ================= BODY ================= */
    const body = await request.json().catch(() => null);
    if (!body || !body.event_id) {
      return new Response("Bad Request", { status: 400 });
    }

    /* ================= DATE (BR) ================= */
    const now = new Date();
    const dateBr = now.toLocaleDateString("en-CA", {
      timeZone: "America/Sao_Paulo"
    });
    const timeBr = now.toLocaleTimeString("pt-BR", {
      timeZone: "America/Sao_Paulo",
      hour12: false
    });

    /* ================= DEDUP ================= */
    const dedupeKey = `capi:event:${body.event_id}`;

    const dedupeCheck = await fetch(
      `${REDIS_URL}/get/${dedupeKey}`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );

    const dedupeJson = await dedupeCheck.json();
    if (dedupeJson.result !== null) {
      return new Response(
        JSON.stringify({ ok: true, deduped: true }),
        { status: 200 }
      );
    }

    // grava dedupe por 48h
    await fetch(
      `${REDIS_URL}/set/${dedupeKey}/1?ex=172800`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );

    /* ================= COUNTER ================= */
    const counterKey = `capi:counter:${dateBr}`;

    const counterRes = await fetch(
      `${REDIS_URL}/incr/${counterKey}`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );

    const counterJson = await counterRes.json();
    const counter = counterJson.result || 0;

    // garante TTL
    await fetch(
      `${REDIS_URL}/expire/${counterKey}/172800`,
      { headers: { Authorization: `Bearer ${REDIS_TOKEN}` } }
    );

    /* ================= META CAPI ================= */
    const userData = {
      client_ip_address:
        request.headers.get("x-nf-client-connection-ip") ||
        request.headers.get("x-forwarded-for") ||
        null,
      client_user_agent: request.headers.get("user-agent") || null
    };

    if (body.fbp) userData.fbp = body.fbp;
    if (body.fbc) userData.fbc = body.fbc;
    if (body.external_id) userData.external_id = [body.external_id];

    const capiPayload = {
      data: [
        {
          event_name: body.event_name,
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url,
          action_source: "website",
          user_data: userData,
          custom_data: body.custom_data || {}
        }
      ]
    };

    const metaRes = await fetch(
      `https://graph.facebook.com/v18.0/${META_PIXEL_ID}/events?access_token=${META_ACCESS_TOKEN}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capiPayload)
      }
    );

    console.log(
      `[CAPI] ${dateBr} ${timeBr} event_id=${body.event_id} status=${metaRes.status} #${counter}`
    );

    return new Response(JSON.stringify({ ok: true }), { status: 200 });

  } catch (err) {
    console.error("[CAPI] handler error", err);
    return new Response("Server Error", { status: 500 });
  }
};
