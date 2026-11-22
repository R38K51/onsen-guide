// ハッシュのルーター。`#/` と `#/about`、クエリ（type、pref、lang）の読み書き。
// 不正な値は無視して、初期状態（null）に戻す。
import { TYPE_IDS } from "./constants.js";
import { PREFECTURES } from "./prefectures.js";

const LANG_VALUES = ["ja", "en"];

export function parseHash(hash) {
  const raw = String(hash ?? "").replace(/^#/, "");
  const q = raw.indexOf("?");
  const path = q === -1 ? raw : raw.slice(0, q);
  const params = new URLSearchParams(q === -1 ? "" : raw.slice(q + 1));
  const type = params.get("type");
  const pref = params.get("pref");
  const lang = params.get("lang");
  return {
    route: path === "/about" ? "about" : "home",
    type: TYPE_IDS.includes(type) ? type : null,
    pref: PREFECTURES.includes(pref) ? pref : null,
    lang: LANG_VALUES.includes(lang) ? lang : null,
  };
}

export function buildHash({ route = "home", type = null, pref = null, lang = null } = {}) {
  const params = new URLSearchParams();
  if (route === "home") {
    if (type) params.set("type", type);
    if (pref) params.set("pref", pref);
  }
  if (lang) params.set("lang", lang);
  const query = params.toString();
  return (route === "about" ? "#/about" : "#/") + (query ? `?${query}` : "");
}
