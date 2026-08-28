// Service worker deliberadament buit.
//
// Existeix només perquè Chrome demana un service worker amb un listener de
// `fetch` abans d'oferir la instal·lació de l'app. NO fem cache de res:
// - `/app/` se serveix amb `no-store` perquè el gate d'autenticació no es
//   reutilitzi entre sessions,
// - les prediccions són privades i canvien cada dia.
// Un listener que no crida `respondWith()` deixa passar la petició a la xarxa
// tal qual, i Chrome el pot ometre com a no-op.

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
