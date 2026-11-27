import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { formatPinNumber, filterAreas, mapView, pinNumbers } from "../src/filter.js";
import {
  LEAFLET_SCRIPT, LEAFLET_VERSION, MAP_BOUNDS, MAP_MAX_ZOOM, MAP_MIN_ZOOM, TILE_SOURCE_LIST_URL, TILE_URL,
} from "../src/constants.js";
import { DICTIONARIES } from "../src/i18n.js";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url));
const text = (path) => read(path).toString("utf8");
const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");
const areas = JSON.parse(text("tests/fixtures/onsen.json")).areas;

test("番号：全件の並び順の順位（1始まり）。絞り込んでも変わらない", () => {
  const numbers = pinNumbers(areas);
  assert.equal(numbers.size, areas.length);
  assert.deepEqual(
    [...numbers.entries()].sort((a, b) => a[1] - b[1]).map(([id]) => id),
    ["alpha", "sample", "beta", "gamma", "long", "epsilon", "delta", "zeta", "eta", "theta"],
  );
  assert.equal(numbers.get("alpha"), 1);
  // 絞り込んだ結果の番号は、全件から作った番号のまま（飛び番になる）
  const shown = filterAreas(areas, { pref: "oita" });
  assert.deepEqual(shown.map((a) => numbers.get(a.id)), [9, 10]);
  assert.deepEqual(filterAreas(areas, { type: "acid" }).map((a) => numbers.get(a.id)), [7]);
});

test("番号の表示は2桁", () => {
  assert.equal(formatPinNumber(1), "01");
  assert.equal(formatPinNumber(21), "21");
});

test("見える範囲：0件、1件、複数", () => {
  assert.deepEqual(mapView([]), { mode: "none" });
  assert.deepEqual(mapView([{ lat: 35, lon: 135 }]), { mode: "single", center: [35, 135] });
  assert.deepEqual(mapView([{ lat: 35, lon: 135 }, { lat: 43, lon: 141 }, { lat: 33, lon: 131 }]), {
    mode: "fit",
    bounds: [[33, 131], [43, 141]],
  });
});

test("実データ：21件すべてに位置と出典があり、日本の範囲に入る", () => {
  const real = JSON.parse(text("data/onsen.json")).areas;
  assert.equal(real.length, 21);
  for (const a of real) {
    assert.ok(a.position.lat >= MAP_BOUNDS[0][0] && a.position.lat <= MAP_BOUNDS[1][0], a.id);
    assert.ok(a.position.lon >= MAP_BOUNDS[0][1] && a.position.lon <= MAP_BOUNDS[1][1], a.id);
    assert.ok(["wikidata", "manual"].includes(a.position.source.kind), a.id);
  }
});

test("タイルの URL は CSP の img-src と同じ origin、ズームの範囲は4〜16", () => {
  const html = text("index.html");
  const csp = html.match(/Content-Security-Policy" content="([^"]*)"/)[1];
  const img = csp.split(";").map((d) => d.trim()).find((d) => d.startsWith("img-src"));
  assert.equal(img, `img-src 'self' ${new URL(TILE_URL).origin}`);
  assert.equal(TILE_URL, "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png");
  assert.equal(new URL(TILE_SOURCE_LIST_URL).origin, "https://maps.gsi.go.jp");
  assert.equal(MAP_MIN_ZOOM, 4);
  assert.equal(MAP_MAX_ZOOM, 16);
  assert.ok(html.includes('href="./vendor/leaflet/leaflet.css"'));
  assert.ok(html.indexOf("leaflet.css") < html.indexOf("css/style.css"));
  assert.ok(html.includes('<meta name="referrer" content="no-referrer">'));
  assert.equal(LEAFLET_SCRIPT, "./vendor/leaflet/leaflet.js");
});

test("Leaflet：版が定数、package.json、leaflet.js の先頭で同じ", () => {
  const pkg = JSON.parse(text("package.json"));
  assert.equal(pkg.devDependencies.leaflet, LEAFLET_VERSION);
  assert.equal(JSON.parse(text("node_modules/leaflet/package.json")).version, LEAFLET_VERSION);
  assert.match(text("vendor/leaflet/leaflet.js").slice(0, 200), new RegExp(`Leaflet ${LEAFLET_VERSION.replaceAll(".", "\\.")},`));
});

test("Leaflet：同梱のファイルは、パッケージの配布物と SHA-256 が同じ（直していない）", () => {
  for (const [vendor, original] of [
    ["vendor/leaflet/leaflet.js", "node_modules/leaflet/dist/leaflet.js"],
    ["vendor/leaflet/leaflet.css", "node_modules/leaflet/dist/leaflet.css"],
    ["vendor/leaflet/LICENSE", "node_modules/leaflet/LICENSE"],
  ]) {
    assert.equal(sha256(read(vendor)), sha256(read(original)), vendor);
  }
  assert.match(text("vendor/leaflet/LICENSE"), /BSD 2-Clause License/);
});

test("Leaflet：同梱の leaflet.js は style 属性を文字で組み立てない（CSP の前提）", () => {
  const source = text("node_modules/leaflet/dist/leaflet-src.js");
  assert.ok(!source.includes("cssText"));
  assert.ok(!source.includes("setAttribute('style'"));
});

test("辞書：地図のキーが日英にそろい、置き換えの名前が同じ", () => {
  const keys = Object.keys(DICTIONARIES.ja).filter((k) => /^(map|about\.map|about\.table\.position)\./.test(k) || k.startsWith("card.showOnMap") || ["card.pinNo", "card.onMap"].includes(k));
  assert.ok(keys.length >= 30);
  for (const key of keys) {
    assert.ok(key in DICTIONARIES.en, key);
    const names = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join();
    assert.equal(names(DICTIONARIES.ja[key]), names(DICTIONARIES.en[key]), key);
  }
  // 「外部のサービスへ通信しません」は残さない
  assert.ok(!DICTIONARIES.ja["about.privacy.text"].includes("通信しません"));
  assert.ok(DICTIONARIES.ja["about.privacy.text"].includes("地図のタイル（国土地理院）のみ"));
  assert.ok(DICTIONARIES.en["about.privacy.text"].includes("map tiles from GSI"));
});
