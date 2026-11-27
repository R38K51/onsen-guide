// DOM を作る。createElement と textContent だけを使う（HTML の文字列を組み立てて入れることはしない）。
import { DICTIONARIES, getLang, t } from "./i18n.js";
import { LEAFLET_VERSION, MAP_LOADING_DELAY_MS, TILE_SOURCE_LIST_URL, TYPE_IDS } from "./constants.js";
import { areaTypes, countByType, filterAreas, formatPinNumber, officialNames, pinNumbers, prefecturesIn, sortAreas } from "./filter.js";
import { createMapView } from "./map.js";
import { buildHash } from "./router.js";

const SVG_NS = "http://www.w3.org/2000/svg";

// 外部の資料（環境省の2点。画面Bだけで使う）
const MOE_REFS = [
  { key: "guideline", url: "https://www.env.go.jp/nature/onsen/docs/shishin_bunseki.pdf" },
  { key: "notice", url: "https://www.env.go.jp/nature/onsen/pdf/2-5_p_11.pdf" },
];
const ISSUES_URL = "https://github.com/R38K51/onsen-guide/issues";

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

// 温泉地の表示名（英語のときはローマ字）
function areaName(area) {
  return getLang() === "en" ? area.nameRoman : area.nameJa;
}

// map：{ no, onShow }（位置のある件だけ。番号と「地図で見る」は、地図が ready になるまで hidden）
function areaCard(area, selectedType, map) {
  const english = getLang() === "en";
  const tags = areaTypes(area).map((id) =>
    el("li", { class: id === selectedType ? "tag is-selected" : "tag", text: t(`type.${id}.name`) }),
  );
  const parts = {};
  if (map) {
    parts.pin = el(
      "p",
      { class: "card-pin", hidden: true },
      el("span", { class: "pin-badge", "aria-hidden": "true", text: formatPinNumber(map.no) }),
      el("span", { class: "sr-only", text: t("card.pinNo", { no: formatPinNumber(map.no) }) }),
    );
    parts.onMap = el("p", { class: "card-onmap", hidden: true }, icon("check"), t("card.onMap"));
    parts.button = el("button", {
      type: "button",
      class: "show-on-map",
      hidden: true,
      "aria-label": t("card.showOnMapLabel", { name: areaName(area) }),
      text: t("card.showOnMap"),
    });
    parts.button.addEventListener("click", () => map.onShow());
  }
  const li = el(
    "li",
    { class: "card" },
    parts.pin ?? null,
    el("h3", { lang: "ja", tabindex: "-1", text: area.nameJa }),
    english ? el("p", { class: "roman", lang: "en", text: area.nameRoman }) : null,
    el("p", { class: "pref", text: t(`pref.${area.prefecture}`) }),
    tags.length > 0 ? el("ul", { class: "tags" }, ...tags) : null,
    el(
      "p",
      { class: "official" },
      `${t("card.officialName")}`,
      el("span", { lang: "ja", text: officialNames(area).join("、") }),
    ),
    parts.onMap ?? null,
    el("div", { class: "card-foot" }, externalLink(area.source.url, "source-link", ...linkLabelNodes(area.source.publisher)), parts.button ?? null),
  );
  return { li, ...parts };
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

// 地図の枠。上の枠（skip、地図、読めないときの枠、案内の行、注記）と、選択の状態を持つ。
// Leaflet は src/map.js だけが知っている。カードの番号と「地図で見る」は、地図が ready になってから出す
function createMapPanel(actions) {
  const lang = getLang();
  const state = {
    status: "off", // off、loading、ready、failed
    reloading: false,
    selectedId: actions.getSelected?.() ?? null,
    controller: null,
    loadingTimer: null,
    lastFilterKey: null,
    areas: [],
    numbers: new Map(),
    cards: new Map(),
    wasHidden: true,
  };

  const skip = el("button", { type: "button", class: "map-skip", text: t("map.skip") });
  const help = el("p", { id: "map-help", class: "sr-only", text: t("map.help") });
  const canvas = el("div", { class: "map-canvas" });
  const loadingText = el("p", { class: "map-loading", hidden: true, text: t("map.loading") });
  const frame = el("div", { class: "map-frame" }, canvas, loadingText);
  const reloadButton = el("button", { type: "button", text: t("map.reload") });
  const failed = el("div", { class: "notice map-failed", role: "status", hidden: true }, el("p", { text: t("map.error") }), reloadButton);

  const hintText = el("p", { class: "map-hint-text" });
  const toCard = el("button", { type: "button", hidden: true, text: t("map.toCard") });
  const clearSelection = el("button", { type: "button", hidden: true, text: t("map.clearSelection") });
  const hint = el("div", { class: "map-hint", hidden: true }, hintText, el("div", { class: "map-hint-actions" }, toCard, clearSelection));

  // 注記：中心の注記、出典、通信の注記、位置のない件
  const marker = "\u0000";
  const sourceParts = t("map.source", { link: marker }).split(marker);
  const open = lang === "ja" ? "（" : " (";
  const close = lang === "ja" ? "）" : ")";
  const sourceLine = el(
    "p",
    {},
    sourceParts[0],
    externalLink(TILE_SOURCE_LIST_URL, "ref-link", `${t("map.sourceLink")}${open}${t("map.sourceExternal")}${close}`),
    sourceParts[1] ?? "",
    lang === "en" ? ` ${t("map.jaNote")}` : null,
  );
  const aboutText = t("nav.about");
  const networkParts = t("map.network").split(aboutText);
  const networkLine = el(
    "p",
    {},
    networkParts[0],
    networkParts.length > 1 ? el("a", { class: "ref-link", href: buildHash({ route: "about", lang }), text: aboutText }) : null,
    networkParts[1] ?? "",
  );
  const noPosition = el("p", { hidden: true });
  const notes = el(
    "div",
    { class: "map-notes", hidden: true },
    el("p", { text: t("map.approx") }),
    sourceLine,
    networkLine,
    noPosition,
  );
  const announce = el("p", { class: "sr-only", role: "status" });
  const root = el("div", { class: "map-box", hidden: true }, skip, help, frame, failed, hint, notes, announce);

  const areaById = () => new Map(state.areas.map((a) => [a.id, a]));

  function applyUi() {
    const ready = state.status === "ready";
    root.classList.toggle("is-ready", ready);
    frame.hidden = state.status === "failed";
    failed.hidden = !(state.status === "failed" || state.reloading);
    skip.hidden = state.status === "failed";
    hint.hidden = !ready;
    notes.hidden = !ready;
    for (const [id, card] of state.cards) {
      if (!card.pin) continue;
      const selected = ready && id === state.selectedId;
      card.pin.hidden = !ready;
      card.button.hidden = !ready;
      card.onMap.hidden = !selected;
      card.li.classList.toggle("is-onmap", selected);
    }
    renderHint();
  }

  function renderHint() {
    const area = state.selectedId ? areaById().get(state.selectedId) : null;
    if (area && state.numbers.has(area.id)) {
      hintText.textContent = t("map.selected", {
        no: formatPinNumber(state.numbers.get(area.id)),
        name: areaName(area),
        pref: t(`pref.${area.prefecture}`),
      });
    } else {
      hintText.textContent = `${t("map.hint.idle")}${lang === "ja" ? "" : " "}${t("map.overlapHint")}`;
    }
    toCard.hidden = clearSelection.hidden = !area;
  }

  function setSelected(id) {
    state.selectedId = id;
    actions.onSelectionChange?.(id);
    const area = id ? areaById().get(id) : null;
    if (area) announce.textContent = t("map.announce", { name: areaName(area) });
    applyUi();
  }

  function onStatus(next) {
    state.status = next;
    clearTimeout(state.loadingTimer);
    loadingText.hidden = true;
    if (next === "loading") {
      state.loadingTimer = setTimeout(() => {
        if (state.status === "loading") loadingText.hidden = false;
      }, MAP_LOADING_DELAY_MS);
    }
    const hadFocus = failed.contains(document.activeElement);
    if (next !== "loading") state.reloading = false;
    applyUi();
    if (next === "ready" && hadFocus) state.controller.focusMap();
  }

  function ensureController() {
    if (state.controller) return;
    state.controller = createMapView({
      host: canvas,
      labels: {
        label: t("map.label"),
        helpId: "map-help",
        zoomIn: t("map.zoomIn"),
        zoomOut: t("map.zoomOut"),
        pin: (no, point) => t("map.pin", { no: formatPinNumber(no), name: areaName(point), pref: t(`pref.${point.prefecture}`) }),
      },
      onSelect: setSelected,
      onStatus,
    });
    state.controller.start();
  }

  // カードの「地図で見る」を押したとき
  function showOnMap(id) {
    state.controller.select(id);
    const rect = frame.getBoundingClientRect();
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0);
    if (visible < rect.height / 2) frame.scrollIntoView({ block: "nearest", behavior: "instant" });
  }

  skip.addEventListener("click", () => {
    const first = document.querySelector(".cards .card h3");
    if (first) first.focus();
  });
  reloadButton.addEventListener("click", () => {
    state.reloading = true;
    state.controller.reload();
  });
  clearSelection.addEventListener("click", () => {
    state.controller.clearSelection();
    state.controller.focusMap();
  });
  toCard.addEventListener("click", () => {
    const button = state.cards.get(state.selectedId)?.button;
    if (!button) return;
    button.scrollIntoView({ block: "center", behavior: "instant" });
    button.focus({ preventScroll: true });
  });

  return {
    root,
    // 結果から消えた温泉地の選択を外す（カードを作り直す前に呼ぶ）
    prepare(areas, shown) {
      state.areas = areas;
      state.numbers = pinNumbers(areas);
      if (state.selectedId && !shown.some((a) => a.id === state.selectedId && a.position)) {
        state.selectedId = null;
        actions.onSelectionChange?.(null);
      }
    },
    cardOptions(area) {
      if (!area.position) return null;
      return { no: state.numbers.get(area.id) ?? 0, onShow: () => showOnMap(area.id) };
    },
    setCards(shown, cards) {
      state.cards = new Map(shown.map((a, i) => [a.id, cards[i]]));
    },
    update({ shown, filterKey }) {
      if (shown.length === 0) {
        root.hidden = true;
        state.wasHidden = true;
        return;
      }
      root.hidden = false;
      const points = shown.filter((a) => a.position).map((a) => ({
        id: a.id, lat: a.position.lat, lon: a.position.lon, nameJa: a.nameJa, nameRoman: a.nameRoman, prefecture: a.prefecture,
      }));
      const missing = shown.length - points.length;
      noPosition.hidden = missing === 0;
      noPosition.textContent = missing === 0 ? "" : t("map.noPosition", { n: missing });
      const refit = filterKey !== state.lastFilterKey;
      state.lastFilterKey = filterKey;
      ensureController();
      if (state.wasHidden) state.controller.invalidate();
      state.wasHidden = false;
      state.controller.update({ points, numbers: state.numbers, selectedId: state.selectedId, refit });
      applyUi();
    },
    hide() {
      root.hidden = true;
      state.wasHidden = true;
    },
    destroy() {
      clearTimeout(state.loadingTimer);
      state.controller?.destroy();
    },
  };
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
  const map = createMapPanel(actions);
  const results = el("div", { class: "results" }, panelHost, heading, map.root, resultsHost);

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
      map.prepare(areas, shown);
      const cards = shown.map((a) => areaCard(a, state.type, map.cardOptions(a)));
      map.setCards(shown, cards);
      resultsHost.replaceChildren(
        note,
        shown.length === 0 ? emptyBox() : el("ul", { class: "cards" }, ...cards.map((c) => c.li)),
        el("div", { class: "notice measure" }, el("p", { text: t("notice.noMedical") })),
      );
      map.update({ shown, filterKey: `${state.type}|${state.pref}` });
    } else if (status === "error") {
      map.hide();
      heading.hidden = true;
      const reload = el("button", { type: "button", text: t("error.reload") });
      reload.addEventListener("click", () => actions.onReload());
      resultsHost.replaceChildren(
        el("div", { class: "notice state-box", role: "alert" }, el("p", { text: t("error.load") }), reload),
      );
    } else if (status === "loading") {
      map.hide();
      heading.hidden = true;
      resultsHost.replaceChildren(
        el("p", { role: "status", text: t("loading") }),
        el("div", { class: "skeletons", "aria-hidden": "true" }, el("div", { class: "skeleton" }), el("div", { class: "skeleton" }), el("div", { class: "skeleton" })),
      );
    } else {
      map.hide();
      heading.hidden = true;
      resultsHost.replaceChildren();
    }
  }

  return { root, heading: h1, update, destroy: () => map.destroy() };
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
        area.position
          ? el(
              "span",
              { class: "pos-source", text: `${t("about.table.position")}${t(area.position.source.kind === "wikidata" ? "about.table.positionWikidata" : "about.table.positionManual")}` },
            )
          : null,
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
    section(
      "about.map.h",
      el("p", { class: "measure", text: t("about.map.text1") }),
      el("p", { class: "measure", text: t("about.map.text2") }),
      el("p", { class: "measure", text: t("about.map.text3", { version: LEAFLET_VERSION }) }),
      el("p", {}, externalLink(TILE_SOURCE_LIST_URL, "ref-link", t("about.map.link"))),
    ),
    section("about.translation.h", el("p", { class: "measure", text: t("notice.translation") }), el("p", { class: "measure", text: t("notice.processing") })),
    section("about.privacy.h", el("p", { class: "measure", text: t("notice.noTracking") }), el("p", { class: "measure", text: t("about.privacy.text") })),
    section(
      "about.contact.h",
      el("p", { class: "measure", text: t("about.contact.text") }),
      el("p", {}, externalLink(ISSUES_URL, "ref-link", ISSUES_URL, " ", t("about.contact.link"))),
    ),
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
