/* TESTE TEMPORARIO — 2026-09-05. APAGAR depois.
 *
 * A metade "mesmo dominio" do experimento. Identica ao `tg.js` do achadinholinks --
 * mesmo 302, mesmo convite, mesmos cabecalhos -- e mora no MESMO site da pagina de
 * teste. Se o resultado dos dois botoes for diferente no aparelho dele, a unica
 * variavel que sobra e a origem do salto, que e a hipotese.
 *
 * Reproduz o que a landing do `nossolareconomico` faz hoje: botao com `href` para o
 * proprio site, que responde 302 para `chat.whatsapp.com`.
 */
const CONVITE = "https://chat.whatsapp.com/DwfeJvVglDeJ2Dei1XainK";

export default async () => new Response(null, {
  status: 302,
  headers: {
    Location: CONVITE,
    "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0"
  }
});
