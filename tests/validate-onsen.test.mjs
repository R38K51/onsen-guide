import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { validateOnsen, countByType, TYPE_IDS } from "../scripts/validate-data.mjs";

const cls = JSON.parse(readFileSync(new URL("../data/classification.json", import.meta.url), "utf8"));
const TODAY = "2026-11-22";

function area(i) {
  return {
    id: `sample-${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
    nameJa: `サンプル${i}温泉`, nameKana: "さんぷる", nameRoman: "Sample Onsen", prefecture: "hokkaido",
    source: { publisher: "サンプル観光協会", title: "題", url: `https://example.invalid/${i}`, checkedAt: TODAY },
    springs: [{ official: "ナトリウム－塩化物泉", type: "chloride", matchedName: "ナトリウム－塩化物泉", basis: "table" }],
  };
}
const good = () => ({ reviewedAt: TODAY, areas: Array.from({ length: 20 }, (_, i) => area(i)) });
const check = (mutate) => { const d = good(); mutate(d); return validateOnsen(d, cls, TODAY); };

test("良いデータはエラーなし", () => assert.deepEqual(validateOnsen(good(), cls, TODAY), []));
test("件数が20未満と30超はエラー", () => {
  assert.ok(check((d) => d.areas.pop()).some((e) => e.includes("20〜30件")));
  assert.ok(check((d) => { for (let i = 20; i < 31; i++) d.areas.push(area(i)); }).some((e) => e.includes("20〜30件")));
});
test("URL の規則", () => {
  for (const url of ["http://example.invalid/a", "", "javascript:alert(1)", "https://u:p@example.invalid/a", "https://example.invalid/a?utm_source=x"]) {
    assert.ok(check((d) => { d.areas[0].source.url = url; }).length > 0, url);
  }
});
test("重複と形式", () => {
  assert.ok(check((d) => { d.areas[1].id = d.areas[0].id; }).some((e) => e.includes("id が重複")));
  assert.ok(check((d) => { d.areas[1].nameJa = d.areas[0].nameJa; }).some((e) => e.includes("nameJa が重複")));
  assert.ok(check((d) => { d.areas[1].source.url = d.areas[0].source.url; }).some((e) => e.includes("url が重複")));
  assert.ok(check((d) => { d.areas[0].nameKana = "サンプル"; }).some((e) => e.includes("nameKana")));
  assert.ok(check((d) => { d.areas[0].nameRoman = "Sample"; }).some((e) => e.includes("nameRoman")));
  assert.ok(check((d) => { d.areas[0].prefecture = "tokyoo"; }).some((e) => e.includes("prefecture")));
  assert.ok(check((d) => { d.areas[0].source.checkedAt = "2026-11-23"; }).some((e) => e.includes("未来")));
});
test("泉質の行の規則", () => {
  assert.ok(check((d) => { d.areas[0].springs = []; }).some((e) => e.includes("springs が空")));
  assert.ok(check((d) => { d.areas[0].springs[0].type = "other"; }).some((e) => e.includes("type")));
  assert.ok(check((d) => { d.areas[0].springs[0].matchedName = "存在しない泉"; }).some((e) => e.includes("対照表にありません")));
  assert.ok(check((d) => { d.areas[0].springs[0].basis = "structure"; }).some((e) => e.includes("note がありません")));
  assert.ok(check((d) => { d.areas[0].springs[0].basis = "guess"; }).some((e) => e.includes("basis")));
});
test("許可していない項目（評価、料金など）はエラー", () => {
  assert.ok(check((d) => { d.areas[0].rating = 5; }).some((e) => e.includes("rating")));
  assert.ok(check((d) => { d.areas[0].springs[0].effect = "x"; }).some((e) => e.includes("effect")));
});
test("泉質ごとの件数", () => {
  const counts = countByType(good());
  assert.equal(counts.chloride, 20);
  assert.equal(Object.keys(counts).length, TYPE_IDS.length);
});
