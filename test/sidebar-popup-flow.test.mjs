import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import test from "node:test";

const html = readFileSync(new URL("../app.html", import.meta.url), "utf8");
const start = html.indexOf("    async function openTopArea(feature)");
const end = html.indexOf("    function showUserLocation", start);
const source = `${html.slice(start, end)}\nthis.openTopArea=openTopArea;`;

function setup() {
  let finishPlace;
  const calls = { centers: 0, popup: [], updates: [] };
  const context = vm.createContext({
    areaRequest: 0,
    experienceMode: "species",
    panel: { classList: { add: value => calls.panel = value } },
    nearestDetailsAt: lngLat => ({ details: { score: 0.6, fH: 0.8 }, lngLat, distance: 0 }),
    nearestPlace: () => new Promise(resolve => { finishPlace = resolve; }),
    areaHTML: place => place ?? "pendent",
    map: {
      once: (event, handler) => { calls.event = event; calls.moveEnd = handler; },
      flyTo: options => { calls.flight = options; },
    },
    popup: { isOpen: () => true },
    showPopup: (...args) => calls.popup.push(args),
    updatePopup: (...args) => calls.updates.push(args),
    centerPopup: () => { calls.centers++; },
  });
  vm.runInContext(source, context);
  return { context, calls, finishPlace: value => finishPlace(value) };
}

const feature = { geometry: { coordinates: [0.78, 42.68] } };

test("el clic de la sidebar no cancel·la el vol per centrar el popup", async () => {
  const harness = setup();
  const opened = harness.context.openTopArea(feature);

  assert.equal(harness.calls.event, "moveend");
  assert.equal(harness.calls.flight.zoom, 11);
  assert.equal(harness.calls.flight.duration, 400);
  assert.equal(harness.calls.flight.speed, undefined);
  assert.equal(harness.calls.popup[0][2], null);
  assert.equal(harness.calls.centers, 0);

  harness.finishPlace("Vielha");
  await opened;
  assert.equal(harness.calls.updates[0][1], null);

  harness.calls.moveEnd();
  assert.equal(harness.calls.centers, 1);
});

test("si el lloc arriba després del vol, el popup complet es torna a dimensionar", async () => {
  const harness = setup();
  const opened = harness.context.openTopArea(feature);

  harness.calls.moveEnd();
  assert.equal(harness.calls.centers, 1);
  harness.finishPlace("Vielha");
  await opened;

  assert.equal(harness.calls.updates[0][1], true);
});

test("el final del plegat no pot interrompre el vol del mapa", () => {
  assert.match(
    html,
    /panelBody\?\.addEventListener\('transitionend',[\s\S]*?popup\.isOpen\(\)\|\|map\.isMoving\(\)[\s\S]*?centerPopup\(\)/,
  );
});
