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
test("泉質の行：matchedName の行の type と違うとエラー", () => {
  assert.ok(check((d) => { d.areas[0].springs[0].type = "sulfate"; }).some((e) => e.includes("type と違います")));
});
test("分類できない行：原文と理由だけ。type、matchedName、basis は付けない", () => {
  const unclassified = (extra = {}) => ({ official: "ラジウム泉", note: "現行の分類に当たらない", ...extra });
  assert.deepEqual(check((d) => { d.areas[0].springs.push(unclassified()); }), []);
  assert.ok(check((d) => { d.areas[0].springs.push(unclassified({ note: "" })); }).some((e) => e.includes("理由の note")));
  assert.ok(check((d) => { d.areas[0].springs.push({ official: "x" }); }).some((e) => e.includes("理由の note")));
  assert.ok(check((d) => { d.areas[0].springs.push(unclassified({ basis: "table" })); }).some((e) => e.includes("basis があります")));
  assert.ok(check((d) => { d.areas[0].springs.push(unclassified({ matchedName: "単純温泉" })); }).some((e) => e.includes("matchedName があります")));
});
test("分類できない行だけの温泉地も形式は通る（札には数えない）", () => {
  const d = good();
  d.areas[0].springs = [{ official: "ラジウム泉", note: "現行の分類に当たらない" }];
  assert.deepEqual(validateOnsen(d, cls, TODAY), []);
  assert.equal(countByType(d).chloride, 19);
});
test("許可していない項目（評価、料金など）はエラー", () => {
  assert.ok(check((d) => { d.areas[0].rating = 5; }).some((e) => e.includes("rating")));
  assert.ok(check((d) => { d.areas[0].springs[0].effect = "x"; }).some((e) => e.includes("effect")));
});
test("泉質ごとの件数", () => {
  const counts = countByType(good());
  assert.equal(counts.chloride, 20);
  assert.equal(Object.keys(counts).length, 10);
  assert.equal(Object.keys(counts).length, TYPE_IDS.length);
});
