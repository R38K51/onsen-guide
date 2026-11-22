// 日英の辞書と t(key, params)。Cookie と localStorage は使わない（言語は URL の lang で決める）。
import ja from "./i18n/ja.js";
import en from "./i18n/en.js";

export const DICTIONARIES = { ja, en };
export const LANGS = ["ja", "en"];

let current = "ja";
let strict = false;

export function setStrict(value) {
  strict = Boolean(value);
}

export function getLang() {
  return current;
}

export function setLang(lang) {
  if (!LANGS.includes(lang)) throw new Error(`unknown lang: ${lang}`);
  current = lang;
}

// URL の lang があればそれ、なければブラウザの言語（ja で始まれば日本語、それ以外は英語）
export function detectLang(urlLang, browserLang) {
  if (LANGS.includes(urlLang)) return urlLang;
  return typeof browserLang === "string" && browserLang.toLowerCase().startsWith("ja") ? "ja" : "en";
}

// {n}、{publisher}、{date} などを置き換える。キーがなければ、strict では例外、公開では日本語にフォールバック
export function t(key, params = {}) {
  let text = DICTIONARIES[current][key];
  if (text === undefined) {
    if (strict) throw new Error(`missing i18n key: ${key} (${current})`);
    text = DICTIONARIES.ja[key] ?? key;
  }
  return text.replace(/\{(\w+)\}/g, (match, name) => (name in params ? String(params[name]) : match));
}
