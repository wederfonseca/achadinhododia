import { getStore } from "https://edge.netlify.com/blobs";

export default async (request, context) => {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const body = await request.json().catch(() => null);
  if (!body || !body.event_id) {
    return new Response("Missing event_id", { status: 400 });
  }

  /* ===== DATA NO HORÁRIO DO BRASIL (UTC-3) ===== */
  const nowUtc = new Date();
  const nowBr = new Date(nowUtc.getTime() - 3 * 60 * 60 * 1000);

  const dateBr = nowBr.toISOString().slice(0, 10);
  const timeBr = nowBr.toISOString().slice(11, 19);

  /* ===== CONTADOR DIÁRIO (BLOBS) ===== */
  const store = getStore("daily-click-counter");
  const key = `clicks:${dateBr}`;

  let count = (await store.get(key, { type: "json" })) || 0;
  count += 1;
  await store.set(key, count);

  /* ===== CAPI ===== */
  const pixelId = context.env.META_PIXEL_ID;
  const accessToken = context.env.META_ACCESS_TOKEN;

  const payload = {
    data: [
      {
        event_name: body.event_name || "GroupJoinIntent",
        event_time: Math.floor(Date.now() / 1000),
        event_id: body.event_id,
        event_source_url: body.event_source_url || "",
        action_source: "website",
        user_data: {
          client_ip_address: request.headers.get("x-forwarded-for"),
          client_user_agent: request.headers.get("user-agent")
        },
        custom_data: body.custom_data || {}
      }
    ]
    // test_event_code: "TEST9384"
  };

  const resp = await fetch(
    `https://graph.facebook.com/v18.0/${pixelId}/events?access_token=${accessToken}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }
  );

  /* ===== LOG FINAL ===== */
  console.log(
    `[CAPI] ${dateBr} ${timeBr} click #${count} event_id=${body.event_id} status=${resp.status}`
  );

  return new Response(JSON.stringify({ ok: true, count }), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
};
