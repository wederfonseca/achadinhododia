/**
 * Netlify Edge Function — Meta CAPI
 * Conversão 100% server-side
 */

export default async (request, context) => {
  try {
    if (request.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await request.json().catch(() => null);
    if (!body || !body.event_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "missing_event_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const pixelId = context.env.META_PIXEL_ID;
    const accessToken = context.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      console.error("[CAPI] missing env vars");
      return new Response(
        JSON.stringify({ ok: false, error: "missing_env_vars" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    /* ===== USER DATA ===== */
    const userData = {
      client_ip_address:
        request.headers.get("x-nf-client-connection-ip") ||
        request.headers.get("x-forwarded-for") ||
        null,

      client_user_agent:
        request.headers.get("user-agent") || null
    };

    if (body.fbp) userData.fbp = body.fbp;
    if (body.fbc) userData.fbc = body.fbc;

    // 🔑 external_id (array recomendado pelo Meta)
    if (body.external_id) {
      userData.external_id = [body.external_id];
    }

    /* ===== PAYLOAD CAPI ===== */
    const capiPayload = {
      data: [
        {
          event_name: body.event_name || "GroupJoinIntent",
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url || "",
          action_source: "website",
          user_data: userData,
          custom_data: body.custom_data || {}
        }
      ]
    };

    const res = await fetch(
      `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(capiPayload)
      }
    );

    const now = new Date();
    console.log(
      `[CAPI] ${now.toISOString()} event_id=${body.event_id} status=${res.status}`
    );

    return new Response(
      JSON.stringify({ ok: true, status: res.status }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (err) {
    console.error("[CAPI] handler error", err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
};
