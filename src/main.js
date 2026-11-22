// 起動。データを読み、URL（ハッシュ）から状態を決めて描く。外部通信はしない（同じ場所の data/onsen.json だけ）。
import { detectLang, getLang, setLang, t } from "./i18n.js";
import { buildHash, parseHash } from "./router.js";
import { applyStaticText, createAboutView, createHomeView, markLanguage, renderFooter } from "./render.js";

const LOADING_DELAY_MS = 200;

let status = "pending"; // pending（200ms まで何も出さない）、loading、ready、error
let data = null;
let current = { route: "home", type: null, pref: null, lang: "ja" };
let view = null;
let viewKey = null;
let lastRoute = null;
let lastLang = null;

function formatDate(iso) {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(getLang(), { dateStyle: "long", timeZone: "UTC" }).format(date);
}

function navigate(patch) {
  location.hash = buildHash({ ...current, ...patch });
}

const actions = {
  onToggleType: (id) => navigate({ route: "home", type: current.type === id ? null : id }),
  onPref: (pref) => navigate({ route: "home", pref }),
  onClear: () => navigate({ route: "home", type: null, pref: null }),
  onReload: () => location.reload(),
};

function render() {
  const parsed = parseHash(location.hash);
  const lang = detectLang(parsed.lang, navigator.language);
  setLang(lang);
  current = { ...parsed, lang };
  // 不正な値を含む URL は、初期状態に戻した形へ直す（履歴は増やさない）
  const canonical = buildHash({ ...parsed, lang: parsed.lang });
  if (location.hash && location.hash !== canonical) history.replaceState(null, "", canonical);

  if (lang !== lastLang) {
    document.documentElement.lang = lang;
    applyStaticText();
    markLanguage(lang);
    lastLang = lang;
  }
  for (const link of document.querySelectorAll("a[data-route]")) {
    link.setAttribute("href", buildHash({ route: link.dataset.route, lang }));
  }
  const heading = parsed.route === "about" ? t("nav.about") : t("home.h1");
  document.title = `${heading} | ${t("site.name")}`;

  const app = document.getElementById("app");
  const key = parsed.route === "about" ? `about|${lang}|${status}` : `home|${lang}`;
  if (key !== viewKey) {
    if (parsed.route === "about") view = createAboutView(status, data, formatDate);
    else view = createHomeView(actions);
    viewKey = key;
    app.replaceChildren(view.root);
  }
  if (parsed.route === "home") {
    view.update(parsed, status, data);
    fitSticky();
  }

  renderFooter(document.getElementById("footer"), { lang, status, data, formatDate });

  // 画面の移動（A と B）のときだけ、見出しにフォーカスを移す。絞り込みでは動かさない
  if (lastRoute !== null && lastRoute !== parsed.route) view.heading.focus();
  lastRoute = parsed.route;
}

// 左の列が画面の高さより高いときは固定をやめて流す（入れ子のスクロールを作らない）
function fitSticky() {
  const filters = document.querySelector(".filters");
  if (!filters) return;
  filters.classList.remove("is-tall");
  filters.classList.toggle("is-tall", filters.offsetHeight + 32 > window.innerHeight);
}

async function loadData() {
  const timer = setTimeout(() => {
    if (status === "pending") {
      status = "loading";
      render();
    }
  }, LOADING_DELAY_MS);
  try {
    const response = await fetch("./data/onsen.json");
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const json = await response.json();
    if (!json || !Array.isArray(json.areas)) throw new Error("bad data");
    data = json;
    status = "ready";
  } catch {
    status = "error";
  } finally {
    clearTimeout(timer);
  }
  render();
}

for (const button of document.querySelectorAll("button[data-lang]")) {
  button.addEventListener("click", () => navigate({ lang: button.dataset.lang }));
}
window.addEventListener("hashchange", render);
window.addEventListener("resize", fitSticky);
render();
loadData();
