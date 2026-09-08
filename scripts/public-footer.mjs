export const PUBLIC_FOOTER_TOKEN = "<!-- boletada:public-footer -->";

export function renderPublicFooter() {
  return `<footer class="site-footer" id="site-footer"><div class="wrap footer-row"><div class="footer-note">Boletada és una eina orientativa. Respecta la normativa, la propietat privada, els límits de recol·lecció i el bosc.</div><div class="footer-links"><a href="/bones-practiques/">Bones pràctiques</a><a href="/legal/#avis-legal">Avís legal</a><a href="/legal/#privacitat">Privacitat</a><a href="/legal/#termes">Termes</a><a href="mailto:hola@boletada.cat">Contacte</a><a href="/app/">Accedeix al mapa →</a><span>© 2026 Boletada</span></div></div><div class="footer-forest" aria-hidden="true"><img src="/media/footer-edible-mushrooms.webp?v=20260908b" alt="" width="2172" height="724" loading="lazy" decoding="async" /></div></footer>`;
}

export function injectPublicFooter(html, sourceName = "HTML públic") {
  const occurrences = html.split(PUBLIC_FOOTER_TOKEN).length - 1;
  if (occurrences !== 1) {
    throw new Error(`${sourceName}: s'esperava exactament un marcador de footer públic i n'hi ha ${occurrences}`);
  }
  return html.replace(PUBLIC_FOOTER_TOKEN, renderPublicFooter());
}
