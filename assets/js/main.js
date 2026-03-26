const WAIT_MS = 400;
let locked = false;

/* ================= UTIL ================= */

function generateEventId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return 'evt_' + Date.now() + '_' + Math.random().toString(36).slice(2);
}

function readCookie(name) {
  const m = document.cookie.match('(^|;)\\s*' + name + '\\s*=\\s*([^;]+)');
  return m ? decodeURIComponent(m.pop()) : null;
}

function getExternalId() {
  const fbp = readCookie('_fbp');
  if (fbp) return fbp;
  return btoa(navigator.userAgent + Intl.DateTimeFormat().resolvedOptions().timeZone);
}

async function sendEventThenRedirect(endpoint, payload, url) {
  try {
    await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-capi-signature': 'v1'
      },
      body: payload,
      keepalive: true
    });
  } catch (e) {
    console.warn('[collect] send error', e);
  }

  setTimeout(() => {
    window.location.href = url;
  }, WAIT_MS);
}

/* ================= MAIN ================= */

document.addEventListener('DOMContentLoaded', () => {

  const buttons = document.querySelectorAll('.btn-track');
  const loadingOverlay = document.getElementById('loading');

  // 🔥 garante que o loading sempre começa escondido
  if (loadingOverlay) loadingOverlay.classList.add('hidden');

  if (!buttons.length) return;

  buttons.forEach(btn => {

    btn.addEventListener('click', ev => {
      ev.preventDefault();

      if (locked) return;
      locked = true;

      const targetUrl = btn.href;
      const groupType = btn.dataset.group || 'geral';
      const endpoint = btn.dataset.collectEndpoint || '/collect';

      const sessionKey = `group_join_sent_${groupType}`;

      // se já clicou nessa sessão → só redireciona
      if (sessionStorage.getItem(sessionKey)) {
        if (loadingOverlay) loadingOverlay.classList.remove('hidden');

        setTimeout(() => {
          window.location.href = targetUrl;
        }, WAIT_MS);

        return;
      }

      // mostra loading
      if (loadingOverlay) {
        loadingOverlay.classList.remove('hidden');
      }

      const eventId = generateEventId();
      sessionStorage.setItem(sessionKey, eventId);

      const payload = JSON.stringify({
        event_name: 'GroupJoinIntent',
        event_id: eventId,
        event_source_url: window.location.href,
        fbp: readCookie('_fbp'),
        fbc: readCookie('_fbc'),
        external_id: getExternalId(),
        custom_data: {
          destination: 'whatsapp_group',
          brand: 'Achadinho do Dia',
          group: groupType
        }
      });

      sendEventThenRedirect(endpoint, payload, targetUrl);
    });

  });

});

/* ================= FIX VOLTAR (bfcache) ================= */

// 🔥 quando voltar pelo botão do navegador
window.addEventListener('pageshow', function(event) {
  const loadingOverlay = document.getElementById('loading');

  if (event.persisted) {
    if (loadingOverlay) {
      loadingOverlay.classList.add('hidden');
    }

    // libera clique novamente
    locked = false;
  }
});