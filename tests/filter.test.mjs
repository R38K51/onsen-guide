import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { areaTypes, countByType, filterAreas, officialNames, prefecturesIn, sortAreas } from "../src/filter.js";

const fixture = JSON.parse(readFileSync(new URL("./fixtures/onsen.json", import.meta.url), "utf8"));
const areas = fixture.areas;
const ids = (list) => list.map((a) => a.id);

test("並び：北から南、同じ県は五十音", () => {
  assert.deepEqual(ids(sortAreas(areas)), [
    "alpha", "sample", "beta", // 北海道：あるふぁ、さんぷる、べーた
    "gamma", "long",           // 秋田：がんま、ながい
    "epsilon", "delta",        // 群馬：いぷしろん、でるた
    "zeta",                    // 神奈川
    "eta", "theta",            // 大分：いーた、しーた
  ]);
});

test("並べ替えは元の配列を変えない", () => {
  const copy = JSON.stringify(areas);
  sortAreas(areas);
  assert.equal(JSON.stringify(areas), copy);
});

test("条件なしは全件", () => {
  assert.equal(filterAreas(areas, {}).length, areas.length);
  assert.equal(filterAreas(areas).length, areas.length);
});

test("種類だけ：複数タグのどれか1つに当たれば出る", () => {
  assert.deepEqual(ids(filterAreas(areas, { type: "chloride" })), ["alpha", "theta"]);
  assert.deepEqual(ids(filterAreas(areas, { type: "sulfate" })), ["alpha"]);
});

test("都道府県だけ", () => {
  assert.deepEqual(ids(filterAreas(areas, { pref: "oita" })), ["eta", "theta"]);
});

test("種類と都道府県は AND", () => {
  assert.deepEqual(ids(filterAreas(areas, { type: "simple", pref: "oita" })), ["theta"]);
  assert.deepEqual(ids(filterAreas(areas, { type: "sulfur", pref: "gunma" })), ["delta"]);
});

test("0件：当たる温泉地がない組み合わせ", () => {
  assert.deepEqual(filterAreas(areas, { type: "iron", pref: "hokkaido" }), []);
  assert.deepEqual(filterAreas(areas, { type: "radioactive" }), []);
});

test("種類に分類できない行はタグにも件数にも出ないが、公式ページの表記には出る", () => {
  const eta = areas.find((a) => a.id === "eta");
  assert.deepEqual(areaTypes(eta), []);
  assert.deepEqual(officialNames(eta), ["テスト用の分類できない泉質名"]);
  assert.equal(Object.values(countByType(areas)).reduce((a, b) => a + b, 0), 13);
});

test("泉質タグは重複を除き、10種類の順", () => {
  const alpha = areas.find((a) => a.id === "alpha");
  assert.deepEqual(areaTypes(alpha), ["chloride", "sulfate"]);
  const delta = areas.find((a) => a.id === "delta");
  assert.deepEqual(areaTypes(delta), ["acid", "sulfur"]);
});

test("公式ページの表記は重複を除く", () => {
  const alpha = areas.find((a) => a.id === "alpha");
  assert.deepEqual(officialNames(alpha), ["ナトリウム－塩化物・硫酸塩泉"]);
});

test("札の件数は全件に対する件数（10種類すべてのキーがある）", () => {
  const counts = countByType(areas);
  assert.equal(Object.keys(counts).length, 10);
  assert.equal(counts.iodine, 1);
  assert.equal(counts.simple, 2);
  assert.equal(counts.sulfur, 2);
  assert.equal(counts.radioactive, 0);
});

test("都道府県の選択肢はデータにある県だけ、北から南", () => {
  assert.deepEqual(prefecturesIn(areas), ["hokkaido", "akita", "gunma", "kanagawa", "oita"]);
});
