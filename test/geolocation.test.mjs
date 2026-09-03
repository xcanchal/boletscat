import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const readProjectFile = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("la ubicació només es demana després de prémer el control del mapa", async () => {
  const app = await readProjectFile("app.html");

  assert.match(app, /aria-label','Mostra la meva ubicació'/);
  assert.match(app, /navigator\.geolocation\.getCurrentPosition/);
  assert.doesNotMatch(app, /navigator\.geolocation\.watchPosition/);
  assert.match(app, /enableHighAccuracy:true,timeout:10000,maximumAge:30000/);
  assert.match(app, /Activa el permís d’ubicació/);
});

test("la posició centra el mapa, mostra el punt i consulta les condicions", async () => {
  const app = await readProjectFile("app.html");

  assert.match(app, /map\.addSource\('user-location'/);
  assert.match(app, /id:'user-location-dot'/);
  assert.match(app, /id:'user-location-pulse'/);
  assert.match(app, /map\.flyTo\(\{center:\[lngLat\.lng,lngLat\.lat\]/);
  assert.match(app, /inspectUserLocation\(lngLat\)/);
  assert.match(app, /nearestDetailsAt\(lngLat\)/);
  assert.match(app, /La teva ubicació/);
  assert.match(app, /showMapLink:!userLocation/);
});

test("les apps natives declaren només permís d’ubicació en ús", async () => {
  const [ios, android] = await Promise.all([
    readProjectFile("ios/App/App/Info.plist"),
    readProjectFile("android/app/src/main/AndroidManifest.xml"),
  ]);

  assert.match(ios, /NSLocationWhenInUseUsageDescription/);
  assert.doesNotMatch(ios, /NSLocationAlways/);
  assert.match(android, /android\.permission\.ACCESS_COARSE_LOCATION/);
  assert.match(android, /android\.permission\.ACCESS_FINE_LOCATION/);
  assert.doesNotMatch(android, /ACCESS_BACKGROUND_LOCATION/);
});
