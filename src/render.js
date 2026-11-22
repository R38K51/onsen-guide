// DOM を作る。createElement と textContent だけを使う（HTML の文字列を組み立てて入れることはしない）。
import { DICTIONARIES, getLang, t } from "./i18n.js";
import { TYPE_IDS } from "./constants.js";
import { areaTypes, countByType, filterAreas, officialNames, prefecturesIn, sortAreas } from "./filter.js";
import { buildHash } from "./router.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// 外部の資料（環境省の2点。画面Bだけで使う）
const MOE_REFS = [
  { key: "guideline", url: "https://www.env.go.jp/nature/onsen/docs/shishin_bunseki.pdf" },
  { key: "notice", url: "https://www.env.go.jp/nature/onsen/pdf/2-5_p_11.pdf" },
];

export function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value === undefined || value === null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child);
  }
  return node;
}

function icon(kind) {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.setAttribute("class", kind === "check" ? "icon check" : "icon");
  const path = document.createElementNS(SVG_NS, "path");
  path.setAttribute("d", kind === "check" ? "M3 8.5l3.2 3.2L13 4.5" : "M5 3h8v8M13 3L3 13");
  svg.append(path);
  return svg;
}

// data-i18n を持つ要素の文字を、いまの言語の辞書で置き換える
export function applyStaticText(root = document) {
  for (const node of root.querySelectorAll("[data-i18n]")) {
    node.textContent = t(node.dataset.i18n);
  }
}

export function markLanguage(lang, root = document) {
  for (const button of root.querySelectorAll("button[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
}

function numberFormat() {
  return new Intl.NumberFormat(getLang());
}

// 外部リンク（新しいタブ）。矢印は飾り
function externalLink(href, className, ...labelNodes) {
  // 矢印だけが次の行に落ちないよう、最後の区切り（「、」か「, 」）より後ろと矢印を折り返さない1組にする
  const last = labelNodes[labelNodes.length - 1];
  const head = labelNodes.slice(0, -1);
  let tail = [];
  if (typeof last === "string" && last.length > 0) {
    const cut = Math.max(last.lastIndexOf("、"), last.lastIndexOf(", "));
    const at = cut >= 0 ? cut + (last[cut] === "、" ? 1 : 2) : Math.max(0, last.length - 1);
    head.push(last.slice(0, at));
    tail = [last.slice(at)];
  } else {
    head.push(last);
  }
  return el(
    "a",
    { href, target: "_blank", rel: "noopener noreferrer", class: className },
    ...head,
    el("span", { class: "nowrap" }, ...tail, icon("arrow")),
  );
}

// "{publisher}" を含む辞書の文を、発行元だけ lang="ja" の要素にして組む
function linkLabelNodes(publisher) {
  const marker = "\u0000";
  const [before, after = ""] = t("card.link", { publisher: marker }).split(marker);
  return [before, el("span", { lang: "ja", text: publisher }), after];
}

function areaCard(area, selectedType) {
  const english = getLang() === "en";
  const tags = areaTypes(area).map((id) =>
    el("li", { class: id === selectedType ? "tag is-selected" : "tag", text: t(`type.${id}.name`) }),
  );
  return el(
    "li",
    { class: "card" },
    el("h3", { lang: "ja", text: area.nameJa }),
    english ? el("p", { class: "roman", lang: "en", text: area.nameRoman }) : null,
    el("p", { class: "pref", text: t(`pref.${area.prefecture}`) }),
    tags.length > 0 ? el("ul", { class: "tags" }, ...tags) : null,
    el(
      "p",
      { class: "official" },
      `${t("card.officialName")}`,
      el("span", { lang: "ja", text: officialNames(area).join("、") }),
    ),
    externalLink(area.source.url, "source-link", ...linkLabelNodes(area.source.publisher)),
  );
}

function typePanel(typeId, headingId) {
  const lang = getLang();
  const other = lang === "ja" ? "en" : "ja";
  const otherName = DICTIONARIES[other][`type.${typeId}.name`];
  return el(
    "section",
    { class: "panel", "aria-labelledby": headingId },
    el("h2", { id: headingId, text: t(`type.${typeId}.name`) }),
    el("p", { class: "alt-name", lang: other, text: otherName }),
    el("p", { class: "small", text: t("type.nameNote") }),
    el("p", { text: t(`type.${typeId}.desc`) }),
    el("p", { class: "small", text: t("type.groupNote") }),
    el("p", { class: "small", text: t("type.sourceNote") }),
    el("div", { class: "notice" }, el("p", { text: t("panel.caution1") }), el("p", { text: t("panel.caution2") })),
    el("p", { class: "small", text: t("type.pressedHint") }),
  );
}

// 画面A。札を押しても作り直さず、必要な所だけ更新する（フォーカスを動かさない）
export function createHomeView(actions) {
  const nf = numberFormat();
  const h1 = el("h1", { id: "page-title", tabindex: "-1", text: t("home.h1") });
  const lead = el("p", { id: "lead", class: "measure", text: t("home.lead") });
  const notes = el(
    "div",
    { class: "home-notes measure" },
    el("p", { text: t("notice.translationShort") }),
    el("p", { text: t("notice.noMedicalShort") }),
  );

  const chips = TYPE_IDS.map((id, i) => {
    const count = el("span", { class: "count" });
    const button = el(
      "button",
      { type: "button", class: "chip", "aria-pressed": "false" },
      el("span", { class: "chip-head" }, icon("check"), el("span", { class: "num", text: String(i + 1).padStart(2, "0") })),
      el("span", { class: "name", text: t(`type.${id}.name`) }),
      count,
    );
    button.addEventListener("click", () => actions.onToggleType(id));
    return { id, button, count };
  });
  const chipGroup = el("div", { class: "chips", role: "group", "aria-labelledby": "lead" }, ...chips.map((c) => c.button));

  const select = el("select", { id: "pref-select" });
  select.addEventListener("change", () => actions.onPref(select.value || null));
  const clearButton = el("button", { type: "button", hidden: true, text: t("filter.clear") });
  // 押したボタンは消えるので、先にフォーカスを都道府県の選択へ移す
  clearButton.addEventListener("click", () => {
    select.focus();
    actions.onClear();
  });
  const filterRow = el(
    "div",
    { class: "filter-row" },
    el("div", { class: "field" }, el("label", { for: "pref-select", text: t("filter.pref") }), select),
    clearButton,
  );
  const filters = el("div", { class: "filters" }, chipGroup, filterRow);

  const panelHost = el("div");
  const heading = el("h2", { id: "results-heading", "aria-live": "polite", "aria-atomic": "true", hidden: true });
  const resultsHost = el("div");
  const results = el("div", { class: "results" }, panelHost, heading, resultsHost);

  const root = el("div", { class: "home" }, el("div", { class: "home-head" }, h1, lead, notes), filters, results);

  let optionsKey = null;
  function setOptions(prefs, selected) {
    const list = selected && !prefs.includes(selected) ? [...prefs, selected] : prefs;
    const key = list.join(",");
    if (key !== optionsKey) {
      optionsKey = key;
      select.replaceChildren(
        el("option", { value: "", text: t("filter.prefAll") }),
        ...list.map((id) => el("option", { value: id, text: t(`pref.${id}`) })),
      );
    }
    select.value = selected ?? "";
  }

  function emptyBox() {
    const button = el("button", { type: "button", text: t("filter.clear") });
    button.addEventListener("click", () => {
      select.focus();
      actions.onClear();
    });
    return el(
      "div",
      { class: "state-box" },
      el("p", { text: t("empty.title") }),
      button,
      el("p", { class: "hint", text: t("empty.note") }),
    );
  }

  function update(state, status, data) {
    const areas = data?.areas ?? [];
    const counts = status === "ready" ? countByType(areas) : null;
    for (const chip of chips) {
      chip.button.setAttribute("aria-pressed", String(state.type === chip.id));
      chip.count.hidden = !counts;
      chip.count.textContent = counts ? t("type.count", { n: nf.format(counts[chip.id]) }) : "";
    }
    setOptions(status === "ready" ? prefecturesIn(areas) : [], state.pref);
    clearButton.hidden = !(state.type || state.pref);

    panelHost.replaceChildren(...(state.type ? [typePanel(state.type, "panel-title")] : []));

    if (status === "ready") {
      const shown = filterAreas(areas, state);
      heading.hidden = false;
      heading.textContent = t("list.heading", { n: nf.format(shown.length) });
      const note = el("p", { class: "hint measure", text: `${t("list.sourceNote")} ${t("card.linkNote")}` });
      resultsHost.replaceChildren(
        note,
        shown.length === 0 ? emptyBox() : el("ul", { class: "cards" }, ...shown.map((a) => areaCard(a, state.type))),
        el("div", { class: "notice measure" }, el("p", { text: t("notice.noMedical") })),
      );
    } else if (status === "error") {
      heading.hidden = true;
      const reload = el("button", { type: "button", text: t("error.reload") });
      reload.addEventListener("click", () => actions.onReload());
      resultsHost.replaceChildren(
        el("div", { class: "notice state-box", role: "alert" }, el("p", { text: t("error.load") }), reload),
      );
    } else if (status === "loading") {
      heading.hidden = true;
      resultsHost.replaceChildren(
        el("p", { role: "status", text: t("loading") }),
        el("div", { class: "skeletons", "aria-hidden": "true" }, el("div", { class: "skeleton" }), el("div", { class: "skeleton" }), el("div", { class: "skeleton" })),
      );
    } else {
      heading.hidden = true;
      resultsHost.replaceChildren();
    }
  }

  return { root, heading: h1, update };
}

function section(titleKey, ...children) {
  return el("section", {}, el("h2", { text: t(titleKey) }), ...children);
}

function areaTable(areas) {
  const english = getLang() === "en";
  const rows = sortAreas(areas).map((area) =>
    el(
      "tr",
      {},
      el(
        "td",
        {},
        el("span", { lang: "ja", text: area.nameJa }),
        english ? el("span", { lang: "en", text: ` (${area.nameRoman})` }) : null,
      ),
      el("td", { lang: "ja", text: area.source.publisher }),
      el("td", {}, externalLink(area.source.url, "", area.source.url)),
    ),
  );
  return el(
    "table",
    { class: "area-table" },
    el("caption", { text: t("about.table.caption") }),
    el(
      "thead",
      {},
      el("tr", {}, el("th", { scope: "col", text: t("about.table.name") }), el("th", { scope: "col", text: t("about.table.publisher") }), el("th", { scope: "col", text: t("about.table.url") })),
    ),
    el("tbody", {}, ...rows),
  );
}

// 画面B：このサイトについて
export function createAboutView(status, data, formatDate) {
  const lang = getLang();
  const h1 = el("h1", { id: "page-title", tabindex: "-1", text: t("nav.about") });

  const refs = MOE_REFS.map((ref) =>
    el(
      "li",
      {},
      el("p", { text: t(`about.ref.${ref.key}.title`) }),
      el("p", { text: `${t("about.ref.publisherLabel")}${t("about.ref.publisher")}` }),
      el(
        "p",
        {},
        t("about.ref.urlLabel"),
        externalLink(ref.url, "ref-link", ref.url, " ", t("about.ref.link")),
      ),
    ),
  );

  let dataBlock;
  if (status === "ready") {
    dataBlock = [
      el("p", { class: "measure", text: t("about.data.text") }),
      el("p", { text: t("footer.updated", { date: formatDate(data.reviewedAt) }) }),
      areaTable(data.areas),
    ];
  } else {
    dataBlock = [el("div", { class: "notice", role: status === "error" ? "alert" : null }, el("p", { text: status === "error" ? t("about.data.empty") : t("loading") }))];
  }

  const root = el(
    "div",
    { class: "about" },
    h1,
    section("about.unofficial.h", el("p", { class: "measure", text: t("notice.unofficial") })),
    section(
      "about.basis.h",
      el("p", { class: "measure", text: t("notice.source") }),
      el("p", { class: "measure", text: t("type.groupNote") }),
      el("ul", { class: "refs" }, ...refs),
    ),
    section(
      "about.caution.h",
      el(
        "div",
        { class: "notice measure" },
        el("p", { text: t("notice.noMedical") }),
        el("p", { text: t("notice.verify") }),
        el("p", { text: t("panel.caution1") }),
        el("p", { text: t("card.linkNote") }),
      ),
    ),
    section("about.data.h", ...dataBlock),
    section("about.translation.h", el("p", { class: "measure", text: t("notice.translation") }), el("p", { class: "measure", text: t("notice.processing") })),
    section("about.privacy.h", el("p", { class: "measure", text: t("notice.noTracking") }), el("p", { class: "measure", text: t("about.privacy.text") })),
    section("about.contact.h", el("p", { class: "measure", text: t("about.contact.text") })),
    section("about.license.h", el("p", { class: "measure", text: t("about.license.text") })),
    el("p", {}, el("a", { class: "link-control", href: buildHash({ route: "home", lang }), text: t("about.back") })),
  );
  return { root, heading: h1 };
}

// フッター：このサイトについて、見直し日、非公式の表記、ライセンス
export function renderFooter(host, { lang, status, data, formatDate }) {
  const items = [
    el("p", {}, el("a", { class: "link-control", href: buildHash({ route: "about", lang }), text: t("nav.about") })),
    status === "ready" && data?.reviewedAt ? el("p", { text: t("footer.updated", { date: formatDate(data.reviewedAt) }) }) : null,
    el("p", { text: t("site.unofficial") }),
    el("p", { text: t("footer.license") }),
  ];
  host.replaceChildren(...items.filter(Boolean));
}
