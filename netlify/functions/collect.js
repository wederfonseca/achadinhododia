// netlify/functions/collect.js
// CAPI com deduplicação estrita baseada em event_id (client é fonte da verdade)

exports.handler = async function (event) {
  try {
    if (event.httpMethod !== 'POST') {
      return { statusCode: 405, body: 'Method Not Allowed' };
    }

    const body = JSON.parse(event.body || '{}');

    /* FAIL FAST: sem event_id = sem dedupe */
    if (!body.event_id) {
      console.error('Missing event_id — aborting');
      return {
        statusCode: 400,
        body: JSON.stringify({ error: 'Missing event_id' })
      };
    }

    const pixelId = process.env.META_PIXEL_ID;
    const accessToken = process.env.META_ACCESS_TOKEN;

    if (!pixelId || !accessToken) {
      console.error('Missing env vars');
      return { statusCode: 500, body: 'Missing env vars' };
    }

    const clientIp =
      event.headers['x-nf-client-connection-ip'] ||
      event.headers['x-forwarded-for'] ||
      null;

    const clientUa = event.headers['user-agent'] || null;

    const user_data = {
      client_ip_address: clientIp,
      client_user_agent: clientUa
    };

    if (body.fbp) user_data.fbp = body.fbp;
    if (body.fbc) user_data.fbc = body.fbc;

    const payload = {
      data: [
        {
          event_name: body.event_name || 'GroupJoinIntent',
          event_time: Math.floor(Date.now() / 1000),
          event_id: body.event_id,
          event_source_url: body.event_source_url || '',
          action_source: 'website',
          user_data,
          custom_data: body.custom_data || {}
        }
      ]
    };

    const url = `https://graph.facebook.com/v16.0/${pixelId}/events?access_token=${accessToken}`;

    console.log('[CAPI] Sending event_id:', body.event_id);

    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const text = await resp.text();
    console.log('[CAPI] Meta response:', resp.status, text);

    return {
      statusCode: 200,
      body: JSON.stringify({ ok: true })
    };

  } catch (err) {
    console.error('collect error', err);
    return {
      statusCode: 500,
      body: String(err)
    };
  }
};
