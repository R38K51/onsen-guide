// データと辞書の検証。失敗したら終了コード 1。
// この回は、対照表（data/classification.json）、辞書、外部 URL と禁止 API の静的検査まで。
// 温泉地データ（data/onsen.json）の検証は、データを入れる次の段階で足す。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";

export const TYPE_IDS = [
  "simple", "co2", "bicarbonate", "chloride", "sulfate", "iron",
  "aluminum", "copperIron", "sulfur", "acid", "radioactive",
];

export const PREFECTURE_IDS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima", "ibaraki", "tochigi", "gunma",
  "saitama", "chiba", "tokyo", "kanagawa", "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano",
  "gifu", "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama",
  "tottori", "shimane", "okayama", "hiroshima", "yamaguchi", "tokushima", "kagawa", "ehime", "kochi", "fukuoka",
  "saga", "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
];

const CLASSIFICATION_KEYS = ["label", "oldName", "name", "type", "page", "note"];
const EMPTY_ALLOWED_KEYS = ["panel.criteria"];

// 効能に読める語。否定の免責の言い回しだけ例外にする
const FORBIDDEN_JA = ["効く", "改善", "予防", "安全", "保証"];
const FORBIDDEN_EN = /\b(cure[sd]?|heal(s|ed|ing)?|improv(e|es|ed|ing)|prevent(s|ed|ing)?|safe(ly|ty)?|guarantee[sd]?)\b/i;
const DISCLAIMER_OK = [/保証しません/g, /\bdo not guarantee\b/gi];

// 限界値の数字（mg、Bq、Ci、マッヘ、10 の累乗）。panel.criteria が空の間は辞書のどこにも置かない
const LIMIT_NUMBER = /\d[\d,.]*\s*(mg|μg|㎎|Bq|Ci|マッヘ|mache)|×\s*10|10⁻/i;

// src と index.html に置いてよい外部 URL（画面Bの環境省の2点と、SVG の名前空間）
export const ALLOWED_URLS = [
  "http://www.w3.org/2000/svg",
  "https://www.env.go.jp/nature/onsen/point/ryoyo.pdf",
  "https://www.env.go.jp/nature/onsen/docs/senshitsumei.pdf",
];

const FORBIDDEN_APIS = ["XMLHttpRequest", "WebSocket", "sendBeacon", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("];

export function validateClassification(rows) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0) return ["classification: 配列でないか、空です"];
  const seenTypes = new Set();
  rows.forEach((row, i) => {
    const at = `classification ${i + 1}件目`;
    if (row === null || typeof row !== "object") { errors.push(`${at}: 物ではありません`); return; }
    for (const key of Object.keys(row)) {
      if (!CLASSIFICATION_KEYS.includes(key)) errors.push(`${at}: 許可していない項目 ${key}`);
    }
    for (const key of ["label", "oldName", "name"]) {
      if (typeof row[key] !== "string") errors.push(`${at}: ${key} が文字ではありません`);
    }
    if (typeof row.label === "string" && row.label.trim() === "") errors.push(`${at}: label が空です`);
    if (typeof row.oldName === "string" && row.oldName.trim() === "") errors.push(`${at}: oldName が空です`);
    if (row.name === "" && !(typeof row.note === "string" && row.note !== "")) {
      errors.push(`${at}: name が空で、note もありません（空欄の見出し行は note に理由を書く）`);
    }
    if (!TYPE_IDS.includes(row.type)) errors.push(`${at}: type が11種類のどれでもありません（${row.type}）`);
    else seenTypes.add(row.type);
    if (!Number.isInteger(row.page) || row.page < 1) errors.push(`${at}: page が1以上の整数ではありません`);
    if (row.note !== undefined && typeof row.note !== "string") errors.push(`${at}: note が文字ではありません`);
  });
  for (const id of TYPE_IDS) {
    if (!seenTypes.has(id)) errors.push(`classification: 泉質 ${id} の行がありません`);
  }
  return errors;
}

function placeholders(text) {
  return [...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
}

export function validateDictionaries(ja, en) {
  const errors = [];
  const jaKeys = Object.keys(ja);
  const enKeys = Object.keys(en);
  for (const k of jaKeys) if (!(k in en)) errors.push(`dictionary: ${k} が en にありません`);
  for (const k of enKeys) if (!(k in ja)) errors.push(`dictionary: ${k} が ja にありません`);

  const required = [];
  for (const id of TYPE_IDS) required.push(`type.${id}.name`, `type.${id}.desc`);
  for (const id of PREFECTURE_IDS) required.push(`pref.${id}`);
  for (const k of required) {
    if (!(k in ja) || !(k in en)) errors.push(`dictionary: 必須キー ${k} がありません`);
  }

  const criteriaOpen = (ja["panel.criteria"] ?? "") !== "" || (en["panel.criteria"] ?? "") !== "";
  for (const [lang, dict] of [["ja", ja], ["en", en]]) {
    for (const [key, value] of Object.entries(dict)) {
      const at = `dictionary ${lang} ${key}`;
      if (typeof value !== "string") { errors.push(`${at}: 文字ではありません`); continue; }
      if (value.trim() === "" && !EMPTY_ALLOWED_KEYS.includes(key)) errors.push(`${at}: 空です`);
      let text = value;
      for (const re of DISCLAIMER_OK) text = text.replace(re, "");
      for (const word of FORBIDDEN_JA) if (text.includes(word)) errors.push(`${at}: 禁止語「${word}」`);
      const m = text.match(FORBIDDEN_EN);
      if (m) errors.push(`${at}: 禁止語 "${m[0]}"`);
      if (!criteriaOpen && LIMIT_NUMBER.test(value)) errors.push(`${at}: 限界値の数字を含みます（panel.criteria が空の間は不可）`);
    }
  }
  for (const k of jaKeys) {
    if (k in en && typeof ja[k] === "string" && typeof en[k] === "string" && placeholders(ja[k]) !== placeholders(en[k])) {
      errors.push(`dictionary ${k}: 置き換えの名前が ja と en で違います`);
    }
  }
  return errors;
}

// 1つのファイルの文字を検査する。外部 URL と禁止 API の使用を返す
export function scanSource(text, name = "(text)") {
  const errors = [];
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>]+/g)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (!ALLOWED_URLS.includes(url)) errors.push(`${name}: 許可していない外部 URL ${url}`);
  }
  for (const api of FORBIDDEN_APIS) {
    if (text.includes(api)) errors.push(`${name}: 使わない決まりの API ${api}`);
  }
  return errors;
}

function listFiles(dir, exts) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, exts));
    else if (exts.some((e) => entry.name.endsWith(e))) out.push(full);
  }
  return out;
}

export async function validateAll(root) {
  const errors = [];
  const classification = JSON.parse(readFileSync(join(root, "data/classification.json"), "utf8"));
  errors.push(...validateClassification(classification));

  const ja = (await import(pathToFileURL(join(root, "src/i18n/ja.js")).href)).default;
  const en = (await import(pathToFileURL(join(root, "src/i18n/en.js")).href)).default;
  errors.push(...validateDictionaries(ja, en));

  const files = [join(root, "index.html"), ...listFiles(join(root, "src"), [".js", ".html"]), ...listFiles(join(root, "css"), [".css"])];
  for (const f of files) errors.push(...scanSource(readFileSync(f, "utf8"), relative(root, f)));

  const notes = [];
  if (!existsSync(join(root, "data/onsen.json"))) notes.push("data/onsen.json はまだありません（温泉地データの検証は次の段階）");
  return { errors, notes, classificationRows: classification.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { errors, notes, classificationRows } = await validateAll(root);
  for (const n of notes) console.log(`注: ${n}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`NG ${e}`);
    console.error(`${errors.length} 件のエラー`);
    process.exit(1);
  }
  console.log(`OK 対照表 ${classificationRows} 行、辞書、静的検査`);
}
