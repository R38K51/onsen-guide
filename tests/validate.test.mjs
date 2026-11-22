import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import {
  TYPE_IDS, PREFECTURE_IDS, validateClassification, validateDictionaries, scanSource, validateAll,
} from "../scripts/validate-data.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// 架空の良い例：10種類に1行ずつ（出典は指針、ページは4〜7）
const goodClassification = () => TYPE_IDS.map((type, i) => ({
  name: `名前${i}`, type, source: "指針", page: 4 + (i % 4),
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
  assert.match(bad((r) => { r[0].type = "aluminum"; }).join("\n"), /10種類/);
  assert.match(bad((r) => { r[0].type = "copperIron"; }).join("\n"), /10種類/);
  assert.match(bad((r) => { r[0].page = 0; }).join("\n"), /page/);
  assert.match(bad((r) => { r[0].page = 99; }).join("\n"), /範囲/);
  assert.match(bad((r) => { r[0].name = ""; }).join("\n"), /name が空/);
  assert.match(bad((r) => { r[0].extra = 1; }).join("\n"), /許可していない項目/);
  assert.match(bad((r) => { r[0].source = "ネット"; }).join("\n"), /source/);
  assert.match(bad((r) => { delete r[0].source; }).join("\n"), /source/);
  assert.match(bad((r) => { r[0].current = "現行"; }).join("\n"), /current は改訂前の資料の行だけ/);
  assert.match(bad((r) => { r[0].source = "改訂前の資料"; r[0].page = 1; }).join("\n"), /current が要ります/);
  assert.match(bad((r) => { r.push({ ...r[0] }); }).join("\n"), /重複/);
  assert.match(bad((r) => { r.pop(); }).join("\n"), /行がありません/);
  assert.notEqual(validateClassification([]).length, 0);
});

test("対照表：改訂前の資料の行は current があれば通る", () => {
  const r = goodClassification();
  r.push({ name: "旧名", type: "chloride", source: "改訂前の資料", page: 1, current: "現行の名前" });
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
  assert.deepEqual(scanSource("https://www.env.go.jp/nature/onsen/docs/shishin_bunseki.pdf"), []);
  assert.deepEqual(scanSource("https://www.env.go.jp/nature/onsen/pdf/2-5_p_11.pdf"), []);
  // 改訂前の資料の URL は、画面に載せない
  assert.match(scanSource("https://www.env.go.jp/nature/onsen/point/ryoyo.pdf").join("\n"), /外部 URL/);
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

test("実データ：対照表は10種類すべてを含み、各行に出典の種別とページがある", () => {
  const rows = JSON.parse(readFileSync(join(root, "data/classification.json"), "utf8"));
  assert.equal(TYPE_IDS.length, 10);
  assert.deepEqual([...new Set(rows.map((r) => r.type))].sort(), [...TYPE_IDS].sort());
  assert.ok(rows.every((r) => ["通知", "指針", "改訂前の資料"].includes(r.source) && Number.isInteger(r.page)));
  // 掲示用泉質名の10種類は通知の行にそろっている
  const notice = rows.filter((r) => r.source === "通知").map((r) => r.name).sort();
  assert.deepEqual(notice, ["単純温泉", "塩化物泉", "炭酸水素塩泉", "硫酸塩泉", "二酸化炭素泉", "含鉄泉", "酸性泉", "含よう素泉", "硫黄泉", "放射能泉"].sort());
  // 現行にない分類（含アルミニウム泉、含銅－鉄泉）の行はない
  assert.ok(!rows.some((r) => /含アルミニウム泉|含銅－鉄泉/.test(r.name)));
  // 含よう素泉は、通知の行と、指針の単純よう素温泉の行にある。旧名の対応にはない
  assert.deepEqual(rows.filter((r) => r.type === "iodine").map((r) => r.source).sort(), ["指針", "指針", "指針", "通知"]);
  // 改訂前の資料の行は、旧名を現行の名前へ引くためだけ（current つき）
  const old = rows.filter((r) => r.source === "改訂前の資料");
  assert.ok(old.length > 0 && old.every((r) => r.current));
});

test("静的検査：日本語の括弧の直前までを URL とみなす", () => {
  assert.deepEqual(scanSource("（https://www.env.go.jp/nature/onsen/pdf/2-5_p_11.pdf）を加工"), []);
  assert.match(scanSource("（https://example.invalid/x）").join("\n"), /外部 URL/);
});
