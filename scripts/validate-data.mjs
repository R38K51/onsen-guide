// データと辞書の検証。失敗したら終了コード 1。
// この回は、対照表（data/classification.json）、辞書、外部 URL と禁止 API の静的検査まで。
// 温泉地データ（data/onsen.json）の検証も行う（設計書 技術設計 4）。
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, join, relative } from "node:path";

// 掲示用泉質名の10種類（通知の順。src/constants.js と同じ並び）
export const TYPE_IDS = [
  "simple", "chloride", "bicarbonate", "sulfate", "co2",
  "iron", "acid", "iodine", "sulfur", "radioactive",
];

export const PREFECTURE_IDS = [
  "hokkaido", "aomori", "iwate", "miyagi", "akita", "yamagata", "fukushima", "ibaraki", "tochigi", "gunma",
  "saitama", "chiba", "tokyo", "kanagawa", "niigata", "toyama", "ishikawa", "fukui", "yamanashi", "nagano",
  "gifu", "shizuoka", "aichi", "mie", "shiga", "kyoto", "osaka", "hyogo", "nara", "wakayama",
  "tottori", "shimane", "okayama", "hiroshima", "yamaguchi", "tokushima", "kagawa", "ehime", "kochi", "fukuoka",
  "saga", "nagasaki", "kumamoto", "oita", "miyazaki", "kagoshima", "okinawa",
];

// 対照表の行：name、type、source（出典の種別）、page（原本の紙面のページ）、current（旧名の行だけ。現行の名前）、note
const CLASSIFICATION_KEYS = ["name", "type", "source", "page", "current", "note"];
// 出典の種別ごとの、許すページの範囲（原本の紙面の番号）
export const CLASSIFICATION_SOURCES = {
  通知: [1, 7],
  指針: [4, 7],
  改訂前の資料: [1, 2],
};
const EMPTY_ALLOWED_KEYS = ["panel.criteria"];

// 効能に読める語。否定の免責の言い回しだけ例外にする
const FORBIDDEN_JA = ["効く", "改善", "予防", "安全", "保証"];
const FORBIDDEN_EN = /\b(cure[sd]?|heal(s|ed|ing)?|improv(e|es|ed|ing)|prevent(s|ed|ing)?|safe(ly|ty)?|guarantee[sd]?)\b/i;
const DISCLAIMER_OK = [/保証しません/g, /\bdo not guarantee\b/gi];

// 限界値の数字（mg、Bq、Ci、マッヘ、10 の累乗）。panel.criteria が空の間は辞書のどこにも置かない
const LIMIT_NUMBER = /\d[\d,.]*\s*(mg|μg|㎎|Bq|Ci|マッヘ|mache)|×\s*10|10⁻/i;

// src と index.html に置いてよい外部 URL（画面Bの環境省の2点と、連絡先の Issues と、SVG の名前空間）
export const ALLOWED_URLS = [
  "http://www.w3.org/2000/svg",
  "https://www.env.go.jp/nature/onsen/docs/shishin_bunseki.pdf",
  "https://www.env.go.jp/nature/onsen/pdf/2-5_p_11.pdf",
  "https://github.com/R38K51/onsen-guide/issues",
  "https://maps.gsi.go.jp/development/ichiran.html", // 出典のリンク（地理院タイル一覧）
];

// 地理院タイルの URL。src/constants.js の TILE_URL と index.html の CSP の2か所だけに書く（scanSource は、この host の URL を見逃す）
export const TILE_HOST = "cyberjapandata.gsi.go.jp";
export const TILE_URL_EXPECTED = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png";
export const CSP_IMG_SRC_EXPECTED = "img-src 'self' https://cyberjapandata.gsi.go.jp";
export const LEAFLET_SCRIPT_EXPECTED = "./vendor/leaflet/leaflet.js";

const FORBIDDEN_APIS = ["XMLHttpRequest", "WebSocket", "sendBeacon", "innerHTML", "outerHTML", "insertAdjacentHTML", "document.write", "eval("];

export function validateClassification(rows) {
  const errors = [];
  if (!Array.isArray(rows) || rows.length === 0) return ["classification: 配列でないか、空です"];
  const seenTypes = new Set();
  const seenRows = new Set();
  rows.forEach((row, i) => {
    const at = `classification ${i + 1}件目`;
    if (row === null || typeof row !== "object") { errors.push(`${at}: 物ではありません`); return; }
    for (const key of Object.keys(row)) {
      if (!CLASSIFICATION_KEYS.includes(key)) errors.push(`${at}: 許可していない項目 ${key}`);
    }
    if (typeof row.name !== "string" || row.name.trim() === "") errors.push(`${at}: name が空です`);
    if (!TYPE_IDS.includes(row.type)) errors.push(`${at}: type が10種類のどれでもありません（${row.type}）`);
    else seenTypes.add(row.type);
    const range = CLASSIFICATION_SOURCES[row.source];
    if (!range) errors.push(`${at}: source が通知、指針、改訂前の資料のどれでもありません（${row.source}）`);
    if (!Number.isInteger(row.page) || row.page < 1) errors.push(`${at}: page が1以上の整数ではありません`);
    else if (range && (row.page < range[0] || row.page > range[1])) errors.push(`${at}: page が ${row.source} の範囲（${range[0]}〜${range[1]}）の外です`);
    if (row.source === "改訂前の資料") {
      if (typeof row.current !== "string" || row.current.trim() === "") errors.push(`${at}: 改訂前の資料の行には、現行の名前 current が要ります`);
    } else if (row.current !== undefined) errors.push(`${at}: current は改訂前の資料の行だけに付けます`);
    if (row.note !== undefined && typeof row.note !== "string") errors.push(`${at}: note が文字ではありません`);
    const key = `${row.source}|${row.name}|${row.type}`;
    if (seenRows.has(key)) errors.push(`${at}: 同じ出典で同じ名前と種類の行が重複しています（${row.name}）`);
    seenRows.add(key);
  });
  for (const id of TYPE_IDS) {
    if (!seenTypes.has(id)) errors.push(`classification: 泉質 ${id} の行がありません`);
  }
  return errors;
}

const AREA_KEYS = ["id", "nameJa", "nameKana", "nameRoman", "prefecture", "source", "position", "springs"];
const POSITION_KEYS = ["lat", "lon", "source"];
const decimals = (n) => (String(n).split(".")[1] ?? "").length;
const SOURCE_KEYS = ["publisher", "title", "url", "checkedAt"];
// type がない行は、10種類に分類できない泉質名（official と note だけ）
const SPRING_KEYS = ["official", "type", "matchedName", "basis", "note"];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function isDate(v) {
  if (typeof v !== "string" || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function checkUrl(value) {
  if (typeof value !== "string" || value === "") return "url が空です";
  let u;
  try { u = new URL(value); } catch { return "url の形が正しくありません"; }
  if (u.protocol !== "https:") return "url が https ではありません";
  if (u.username !== "" || u.password !== "") return "url にユーザー名があります";
  if ([...u.searchParams.keys()].some((k) => /^utm_/i.test(k))) return "url に追跡の引数があります";
  return null;
}

// 位置（設計書 技術設計 M4）。緯度は 24〜46、経度は 122〜146、小数3桁以内（取り違えは範囲で見つける）
export function validatePosition(position, at, today) {
  const errors = [];
  if (position === null || typeof position !== "object" || Array.isArray(position)) return [`${at}: position がありません`];
  for (const key of Object.keys(position)) if (!POSITION_KEYS.includes(key)) errors.push(`${at}: position に許可していない項目 ${key}`);
  const { lat, lon, source } = position;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < 24 || lat > 46) errors.push(`${at}: position.lat が 24〜46 の数ではありません（${lat}）`);
  else if (decimals(lat) > 3) errors.push(`${at}: position.lat が小数3桁を超えています（${lat}）`);
  if (typeof lon !== "number" || !Number.isFinite(lon) || lon < 122 || lon > 146) errors.push(`${at}: position.lon が 122〜146 の数ではありません（${lon}）`);
  else if (decimals(lon) > 3) errors.push(`${at}: position.lon が小数3桁を超えています（${lon}）`);
  if (source === null || typeof source !== "object" || Array.isArray(source)) { errors.push(`${at}: position.source がありません`); return errors; }
  const allowed = source.kind === "wikidata" ? ["kind", "id", "checkedAt"] : ["kind", "note", "checkedAt"];
  for (const key of Object.keys(source)) if (!allowed.includes(key)) errors.push(`${at}: position.source に許可していない項目 ${key}`);
  if (source.kind === "wikidata") {
    if (typeof source.id !== "string" || !/^Q\d+$/.test(source.id)) errors.push(`${at}: position.source.id が Q と数字ではありません`);
  } else if (source.kind === "manual") {
    if (typeof source.note !== "string" || source.note.trim() === "") errors.push(`${at}: position.source.note が空です`);
  } else errors.push(`${at}: position.source.kind が wikidata でも manual でもありません`);
  if (!isDate(source.checkedAt)) errors.push(`${at}: position.source.checkedAt が日付ではありません`);
  else if (source.checkedAt > today) errors.push(`${at}: position.source.checkedAt が未来の日付です`);
  return errors;
}

// today は「未来の日付でない」確認用（YYYY-MM-DD）。テストでは固定値を渡す
export function validateOnsen(data, classificationRows, today = new Date().toISOString().slice(0, 10)) {
  const errors = [];
  if (data === null || typeof data !== "object" || !Array.isArray(data.areas)) return ["onsen: areas が配列ではありません"];
  for (const key of Object.keys(data)) {
    if (!["reviewedAt", "areas"].includes(key)) errors.push(`onsen: 許可していない項目 ${key}`);
  }
  if (!isDate(data.reviewedAt)) errors.push("onsen: reviewedAt が日付（YYYY-MM-DD）ではありません");
  const n = data.areas.length;
  if (n < 20 || n > 30) errors.push(`onsen: 温泉地が ${n} 件です（20〜30件）`);
  // 対照表の名前 → その名前の行がもつ type の集まり
  const known = new Map();
  for (const r of classificationRows) {
    if (!known.has(r.name)) known.set(r.name, new Set());
    known.get(r.name).add(r.type);
  }
  const seen = { id: new Set(), nameJa: new Set(), url: new Set(), position: new Set() };
  const dupPosition = (value, at) => {
    if (seen.position.has(value)) errors.push(`${at}: position が他の件と同じ座標です（${value}。コピーミスの疑い）`);
    seen.position.add(value);
  };
  const dup = (kind, value, at) => {
    if (seen[kind].has(value)) errors.push(`${at}: ${kind} が重複しています（${value}）`);
    seen[kind].add(value);
  };
  data.areas.forEach((a, i) => {
    const at = `onsen ${i + 1}件目`;
    if (a === null || typeof a !== "object") { errors.push(`${at}: 物ではありません`); return; }
    for (const key of Object.keys(a)) if (!AREA_KEYS.includes(key)) errors.push(`${at}: 許可していない項目 ${key}`);
    if (typeof a.id !== "string" || !/^[a-z]+(-[a-z]+)*$/.test(a.id)) errors.push(`${at}: id が半角小文字とハイフンではありません`);
    else dup("id", a.id, at);
    if (typeof a.nameJa !== "string" || a.nameJa === "") errors.push(`${at}: nameJa が空です`);
    else dup("nameJa", a.nameJa, at);
    if (typeof a.nameKana !== "string" || !/^[ぁ-ゖー]+$/.test(a.nameKana)) errors.push(`${at}: nameKana がひらがなだけではありません`);
    if (typeof a.nameRoman !== "string" || !/^[A-Z][A-Za-z ]* Onsen$/.test(a.nameRoman)) errors.push(`${at}: nameRoman が「… Onsen」の形ではありません`);
    if (!PREFECTURE_IDS.includes(a.prefecture)) errors.push(`${at}: prefecture が47の id のどれでもありません（${a.prefecture}）`);
    const s = a.source;
    if (s === null || typeof s !== "object") errors.push(`${at}: source がありません`);
    else {
      for (const key of Object.keys(s)) if (!SOURCE_KEYS.includes(key)) errors.push(`${at}: source に許可していない項目 ${key}`);
      for (const key of ["publisher", "title"]) {
        if (typeof s[key] !== "string" || s[key].trim() === "") errors.push(`${at}: source.${key} が空です`);
      }
      const urlError = checkUrl(s.url);
      if (urlError) errors.push(`${at}: source.${urlError}`);
      else dup("url", s.url, at);
      if (!isDate(s.checkedAt)) errors.push(`${at}: source.checkedAt が日付ではありません`);
      else if (s.checkedAt > today) errors.push(`${at}: source.checkedAt が未来の日付です`);
    }
    errors.push(...validatePosition(a.position, at, today));
    if (typeof a.position?.lat === "number" && typeof a.position?.lon === "number") dupPosition(`${a.position.lat},${a.position.lon}`, at);
    if (!Array.isArray(a.springs) || a.springs.length === 0) { errors.push(`${at}: springs が空です`); return; }
    a.springs.forEach((sp, j) => {
      const sat = `${at} springs ${j + 1}行目`;
      if (sp === null || typeof sp !== "object") { errors.push(`${sat}: 物ではありません`); return; }
      for (const key of Object.keys(sp)) if (!SPRING_KEYS.includes(key)) errors.push(`${sat}: 許可していない項目 ${key}`);
      if (typeof sp.official !== "string" || sp.official.trim() === "") errors.push(`${sat}: official が空です`);
      if (sp.type === undefined) {
        // 分類できない行：原文と理由だけ。type、matchedName、basis は付けない
        if (typeof sp.note !== "string" || sp.note.trim() === "") errors.push(`${sat}: type がない行には、理由の note が要ります`);
        for (const key of ["matchedName", "basis"]) {
          if (sp[key] !== undefined) errors.push(`${sat}: type がない行に ${key} があります`);
        }
        return;
      }
      if (!TYPE_IDS.includes(sp.type)) errors.push(`${sat}: type が10種類のどれでもありません（${sp.type}）`);
      if (typeof sp.matchedName !== "string" || sp.matchedName.trim() === "") errors.push(`${sat}: matchedName が空です`);
      else if (!known.has(sp.matchedName)) errors.push(`${sat}: matchedName が対照表にありません（${sp.matchedName}）`);
      else if (!known.get(sp.matchedName).has(sp.type)) errors.push(`${sat}: matchedName の行の type と違います（${sp.matchedName}）`);
      if (sp.basis === "table") {
        if (sp.official !== sp.matchedName) errors.push(`${sat}: basis が table だが official と matchedName が違います`);
      } else if (sp.basis === "structure") {
        if (typeof sp.note !== "string" || sp.note.trim() === "") errors.push(`${sat}: basis が structure なのに note がありません`);
      } else errors.push(`${sat}: basis が table でも structure でもありません`);
    });
  });
  return errors;
}

// 泉質ごとの温泉地の件数（0件の泉質も含む）
export function countByType(data) {
  const counts = Object.fromEntries(TYPE_IDS.map((id) => [id, 0]));
  for (const a of data.areas ?? []) {
    for (const type of new Set((a.springs ?? []).map((sp) => sp.type))) if (type in counts) counts[type] += 1;
  }
  return counts;
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
  for (const m of text.matchAll(/https?:\/\/[^\s"'`)<>\u0080-￿]+/g)) {
    const url = m[0].replace(/[.,;]+$/, "");
    if (url.startsWith(`https://${TILE_HOST}`) || url.startsWith(`http://${TILE_HOST}`)) continue; // 地理院タイルは scanTileRules で見る
    if (!ALLOWED_URLS.includes(url)) errors.push(`${name}: 許可していない外部 URL ${url}`);
  }
  for (const api of FORBIDDEN_APIS) {
    if (text.includes(api)) errors.push(`${name}: 使わない決まりの API ${api}`);
  }
  return errors;
}

// 地理院タイルの規則（M8）。files は { 相対パス: 本文 }（src/ と index.html。vendor/ は対象外）
export function scanTileRules(files) {
  const errors = [];
  for (const [name, text] of Object.entries(files)) {
    if (!text.includes(TILE_HOST)) continue;
    if (name !== "src/constants.js" && name !== "index.html") errors.push(`${name}: ${TILE_HOST} は src/constants.js と index.html の CSP だけに書く決まりです`);
  }
  const constants = files["src/constants.js"] ?? "";
  const tile = constants.match(/export const TILE_URL = "([^"]*)"/);
  if (!tile || tile[1] !== TILE_URL_EXPECTED) errors.push(`src/constants.js: TILE_URL が ${TILE_URL_EXPECTED} と同じではありません`);
  if (constants.split(TILE_HOST).length - 1 !== 1) errors.push(`src/constants.js: ${TILE_HOST} の出現は TILE_URL の1回だけにします`);
  const html = files["index.html"] ?? "";
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]*)"/);
  const directives = csp ? csp[1].split(";").map((d) => d.trim()) : [];
  if (!directives.includes("default-src 'none'")) errors.push("index.html: CSP に default-src 'none' がありません");
  if (!directives.includes(CSP_IMG_SRC_EXPECTED)) errors.push(`index.html: CSP の img-src が ${CSP_IMG_SRC_EXPECTED} と同じではありません`);
  for (const d of ["script-src 'self'", "style-src 'self'", "connect-src 'self'", "font-src 'none'"]) {
    if (!directives.includes(d)) errors.push(`index.html: CSP に ${d} がありません`);
  }
  if (directives.some((d) => d.includes("unsafe-inline") || d.includes("unsafe-eval"))) errors.push("index.html: CSP に unsafe-inline か unsafe-eval があります");
  // 動的に作る script の src は、同梱の leaflet.js だけ（constants の定数を使う）
  for (const [name, text] of Object.entries(files)) {
    if (name === "src/constants.js") continue;
    if (/\.src\s*=\s*["'`]/.test(text)) errors.push(`${name}: script の src を文字で直接書いています（constants の LEAFLET_SCRIPT を使います）`);
  }
  const script = constants.match(/export const LEAFLET_SCRIPT = "([^"]*)"/);
  if (!script || script[1] !== LEAFLET_SCRIPT_EXPECTED) errors.push(`src/constants.js: LEAFLET_SCRIPT が ${LEAFLET_SCRIPT_EXPECTED} と同じではありません`);
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
  const texts = {};
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    const name = relative(root, f).replaceAll("\\", "/");
    errors.push(...scanSource(text, name));
    if (name === "index.html" || name.startsWith("src/")) texts[name] = text;
  }
  errors.push(...scanTileRules(texts));

  const notes = [];
  let areas = 0;
  let counts = null;
  if (!existsSync(join(root, "data/onsen.json"))) notes.push("data/onsen.json はまだありません");
  else {
    const onsen = JSON.parse(readFileSync(join(root, "data/onsen.json"), "utf8"));
    errors.push(...validateOnsen(onsen, classification));
    areas = onsen.areas?.length ?? 0;
    counts = countByType(onsen);
    const empty = Object.entries(counts).filter(([, c]) => c === 0).map(([id]) => id);
    if (empty.length > 0) notes.push(`0件の泉質（警告）: ${empty.join("、")}`);
  }
  return { errors, notes, classificationRows: classification.length, areas, counts };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const { errors, notes, classificationRows, areas, counts } = await validateAll(root);
  for (const n of notes) console.log(`注: ${n}`);
  if (errors.length > 0) {
    for (const e of errors) console.error(`NG ${e}`);
    console.error(`${errors.length} 件のエラー`);
    process.exit(1);
  }
  if (counts) console.log(`泉質ごとの温泉地の件数: ${TYPE_IDS.map((id) => `${id} ${counts[id]}`).join("、")}`);
  console.log(`OK 対照表 ${classificationRows} 行、温泉地 ${areas} 件、辞書、静的検査`);
}
