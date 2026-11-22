import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  TYPE_IDS, PREFECTURE_IDS, validateClassification, validateDictionaries, scanSource, validateAll,
} from "../scripts/validate-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 架空の良い例：11種類に1行ずつ
const goodClassification = () => TYPE_IDS.map((type, i) => ({
  label: String(i + 1), oldName: `旧名${i}`, name: `新名${i}`, type, page: 1,
}));

function goodDict() {
  const d = { "a.b": "ふつうの文", count: "{n}件", "panel.criteria": "" };
  for (const id of TYPE_IDS) { d[`type.${id}.name`] = id; d[`type.${id}.desc`] = `${id} の説明`; }
  for (const id of PREFECTURE_IDS) d[`pref.${id}`] = id;
  return d;
}

test("対照表：良い例は通る", () => {
  assert.deepEqual(validateClassification(goodClassification()), []);
});

test("対照表：悪い例（各規則を1つずつ破る）", () => {
  const bad = (mutate) => { const r = goodClassification(); mutate(r); return validateClassification(r); };
  assert.match(bad((r) => { r[0].type = "iodine"; }).join("\n"), /11種類/);
  assert.match(bad((r) => { r[0].page = 0; }).join("\n"), /page/);
  assert.match(bad((r) => { r[0].name = ""; }).join("\n"), /name が空/);
  assert.match(bad((r) => { r[0].extra = 1; }).join("\n"), /許可していない項目/);
  assert.match(bad((r) => { r[0].oldName = ""; }).join("\n"), /oldName が空/);
  assert.match(bad((r) => { r.pop(); }).join("\n"), /行がありません/);
  assert.notEqual(validateClassification([]).length, 0);
});

test("対照表：空欄の見出し行は note があれば通る", () => {
  const r = goodClassification();
  r[0].name = "";
  r[0].note = "原本の新泉質名の欄は空欄";
  assert.deepEqual(validateClassification(r), []);
});

test("辞書：良い例は通る", () => {
  assert.deepEqual(validateDictionaries(goodDict(), goodDict()), []);
});

test("辞書：キーの不一致、置き換え名の不一致、空の文字、必須キー", () => {
  const ja = goodDict();
  const en = goodDict();
  delete en["a.b"];
  assert.match(validateDictionaries(ja, en).join("\n"), /a\.b が en にありません/);

  const en2 = goodDict();
  en2.count = "{m}";
  assert.match(validateDictionaries(goodDict(), en2).join("\n"), /置き換えの名前/);

  const en3 = goodDict();
  en3["a.b"] = " ";
  assert.match(validateDictionaries(goodDict(), en3).join("\n"), /空です/);

  const ja4 = goodDict();
  delete ja4["type.sulfur.desc"];
  const en4 = goodDict();
  delete en4["type.sulfur.desc"];
  assert.match(validateDictionaries(ja4, en4).join("\n"), /必須キー type\.sulfur\.desc/);
});

test("辞書：禁止語（日本語と英語）。否定の免責は通す", () => {
  for (const word of ["効く", "改善", "予防", "安全", "保証"]) {
    const ja = goodDict();
    ja["a.b"] = `これは${word}します`;
    assert.match(validateDictionaries(ja, goodDict()).join("\n"), new RegExp(`禁止語「${word}」`));
  }
  for (const word of ["cure", "heals", "improve", "prevent", "safe", "guarantee"]) {
    const en = goodDict();
    en["a.b"] = `It will ${word} you`;
    assert.match(validateDictionaries(goodDict(), en).join("\n"), /禁止語/, word);
  }
  const ok = goodDict();
  ok["a.b"] = "最新であることを保証しません";
  const okEn = goodDict();
  okEn["a.b"] = "We do not guarantee this. Check your health with a doctor.";
  assert.deepEqual(validateDictionaries(ok, okEn), []);
});

test("辞書：panel.criteria が空の間は限界値の数字を置けない", () => {
  for (const text of ["遊離二酸化炭素 1,000mg 以上", "ラドン 111Bq 以上", "20 mg per kg", "30×10⁻¹⁰Ci"]) {
    const ja = goodDict();
    ja["a.b"] = text;
    assert.match(validateDictionaries(ja, goodDict()).join("\n"), /限界値の数字/, text);
  }
  // 限界値ではない数字（溶存物質 1 g、25 ℃、pH）は通る
  const ok = goodDict();
  ok["a.b"] = "溶存物質が1kg中1g未満で、泉温が25℃以上。pHが8.5以上。";
  assert.deepEqual(validateDictionaries(ok, goodDict()), []);
});

test("静的検査：外部 URL と使わない API", () => {
  assert.deepEqual(scanSource('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), []);
  assert.deepEqual(scanSource("https://www.env.go.jp/nature/onsen/point/ryoyo.pdf"), []);
  assert.match(scanSource('<script src="https://cdn.example.invalid/x.js"></script>').join("\n"), /外部 URL/);
  assert.match(scanSource("fetch('http://example.invalid/')").join("\n"), /外部 URL/);
  assert.match(scanSource("el.innerHTML = x").join("\n"), /innerHTML/);
  assert.match(scanSource("new XMLHttpRequest()").join("\n"), /XMLHttpRequest/);
  assert.match(scanSource("navigator.sendBeacon(u)").join("\n"), /sendBeacon/);
});

test("実データ：対照表、辞書、src は検証を通る", async () => {
  const { errors } = await validateAll(root);
  assert.deepEqual(errors, []);
});

test("実データ：対照表は11種類すべてを含み、ページは1か2", () => {
  const rows = JSON.parse(readFileSync(join(root, "data/classification.json"), "utf8"));
  assert.deepEqual([...new Set(rows.map((r) => r.type))].sort(), [...TYPE_IDS].sort());
  assert.ok(rows.every((r) => r.page === 1 || r.page === 2));
  // 含よう素泉は扱わない（type に iodine はない）。旧名の含ヨウ素－食塩泉は塩化物泉
  const iodine = rows.filter((r) => r.oldName === "含ヨウ素－食塩泉");
  assert.equal(iodine.length, 1);
  assert.equal(iodine[0].type, "chloride");
});
