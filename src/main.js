// 起動。骨組み：言語を決めて固定の文言を描く。一覧と絞り込みは次の段階で実装する。
import { detectLang, setLang, t } from "./i18n.js";
import { parseHash } from "./router.js";
import { applyStaticText, markLanguage } from "./render.js";

function start() {
  const { params } = parseHash(location.hash);
  const lang = detectLang(params.get("lang"), navigator.language);
  setLang(lang);
  document.documentElement.lang = lang;
  document.title = t("site.name");
  applyStaticText();
  markLanguage(lang);
}

start();
