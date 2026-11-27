// 地図（Leaflet）を扱う唯一のファイル。ほかのファイルはグローバルの L を知らない。
// 通信は、このサイト自身の vendor/leaflet/leaflet.js と、地理院タイル（TILE_URL）の画像だけ。
import {
  LEAFLET_SCRIPT, MAP_BOUNDS, MAP_FIT_MAX_ZOOM, MAP_FIT_PADDING, MAP_MAX_ZOOM, MAP_MIN_ZOOM,
  MAP_SINGLE_ZOOM, MAP_TILE_TIMEOUT_MS, TILE_URL,
} from "./constants.js";
import { formatPinNumber, mapView } from "./filter.js";

let leafletPromise = null;

// leaflet.js を1回だけ読む。失敗したら script を取り除き、次の呼び出しで作り直す
function loadLeaflet() {
  if (globalThis.L) return Promise.resolve(globalThis.L);
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    const fail = () => {
      script.remove();
      leafletPromise = null;
      reject(new Error("leaflet load failed"));
    };
    script.onload = () => (globalThis.L ? resolve(globalThis.L) : fail());
    script.onerror = fail;
    script.src = LEAFLET_SCRIPT;
    document.head.append(script);
  });
  return leafletPromise;
}

// Leaflet 1.9.4 の TileLayer は、使い終わったタイルの img の src を data: の画像に書き換える（通信の取り消しのため）。
// この CSP（img-src に data: を入れない）では違反になるので、書き換えを省いた層を使う。
// 版を 1.9.4 に固定し、同梱ファイルを SHA-256 で固定しているので、内部の関数名に頼っても外れない。
function quietTileLayer(Leaflet) {
  return Leaflet.TileLayer.extend({
    _abortLoading() {
      for (const key of Object.keys(this._tiles)) {
        const entry = this._tiles[key];
        if (entry.coords.z === this._tileZoom) continue;
        const tile = entry.el;
        tile.onload = Leaflet.Util.falseFn;
        tile.onerror = Leaflet.Util.falseFn;
        if (!tile.complete) {
          Leaflet.DomUtil.remove(tile);
          delete this._tiles[key];
          this.fire("tileabort", { tile, coords: entry.coords });
        }
      }
    },
    _removeTile(key) {
      if (!this._tiles[key]) return undefined;
      return Leaflet.GridLayer.prototype._removeTile.call(this, key);
    },
  });
}

// host：地図を入れる空の要素。labels：{ label, helpId, zoomIn, zoomOut, pin(no, area) }
// onStatus("loading" | "ready" | "failed")、onSelect(id | null)
export function createMapView({ host, labels, onSelect, onStatus }) {
  let L = null;
  let map = null;
  let layer = null;
  let tileLayer = null;
  let status = "loading";
  let generation = 0; // 再読み込みや破棄のとき、古い非同期の結果を捨てる
  let timer = null;
  let tileLoaded = 0;
  let tileErrors = 0;
  let selectedId = null;
  let pending = { points: [], numbers: new Map(), selectedId: null, refit: true };
  let shownKey = null;
  const markers = new Map(); // id → { marker, point }

  function setStatus(next) {
    if (status === next) return;
    status = next;
    onStatus(next);
  }

  function fail() {
    clearTimeout(timer);
    generation += 1;
    if (map) {
      map.remove();
      map = null;
    }
    layer = null;
    tileLayer = null;
    markers.clear();
    shownKey = null;
    setStatus("failed");
  }

  function decorate(id) {
    const entry = markers.get(id);
    const node = entry?.marker.getElement();
    if (!node) return;
    const selected = id === selectedId;
    node.dataset.id = id;
    node.classList.toggle("is-selected", selected);
    node.setAttribute("aria-label", labels.pin(entry.no, entry.point));
    node.setAttribute("aria-pressed", String(selected));
    entry.marker.setZIndexOffset(selected ? 1000 : 0);
  }

  function makeMarker(point, no) {
    const text = document.createElement("span");
    text.className = "pin-num";
    text.setAttribute("aria-hidden", "true");
    text.textContent = formatPinNumber(no);
    const marker = L.marker([point.lat, point.lon], {
      icon: L.divIcon({ className: "pin-icon", html: text, iconSize: [44, 44], iconAnchor: [22, 22] }),
      keyboard: true,
      riseOnHover: false,
    });
    marker.on("click", () => select(point.id));
    return { marker, point, no };
  }

  function fit(points) {
    const view = mapView(points);
    if (view.mode === "single") map.setView(view.center, MAP_SINGLE_ZOOM, { animate: false });
    else if (view.mode === "fit") {
      map.fitBounds(view.bounds, { padding: [MAP_FIT_PADDING, MAP_FIT_PADDING], maxZoom: MAP_FIT_MAX_ZOOM, animate: false });
    }
  }

  function apply() {
    if (!map) return;
    const { points, numbers, refit } = pending;
    selectedId = pending.selectedId;
    const key = points.map((p) => `${p.id}:${numbers.get(p.id)}`).join(",");
    if (key !== shownKey) {
      shownKey = key;
      layer.clearLayers();
      markers.clear();
      // 番号の順に入れる（DOM の順と Tab の順が番号の順になる）
      const ordered = [...points].sort((a, b) => numbers.get(a.id) - numbers.get(b.id));
      for (const point of ordered) {
        const entry = makeMarker(point, numbers.get(point.id));
        markers.set(point.id, entry);
        layer.addLayer(entry.marker);
      }
    }
    for (const id of markers.keys()) decorate(id);
    if (refit) fit(points);
    pending.refit = false;
  }

  function build(gen) {
    map = L.map(host, {
      zoomAnimation: false,
      fadeAnimation: false,
      markerZoomAnimation: false,
      inertia: false,
      scrollWheelZoom: false,
      boxZoom: false,
      attributionControl: false,
      zoomControl: false, // 「＋」「－」は、下で辞書の文字を付けて足す
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      maxBounds: MAP_BOUNDS,
      maxBoundsViscosity: 1.0,
      keyboard: true,
    });
    map.setView([37.5, 138], MAP_MIN_ZOOM, { animate: false });
    L.control.zoom({ position: "topleft", zoomInTitle: labels.zoomIn, zoomOutTitle: labels.zoomOut }).addTo(map);
    const container = map.getContainer();
    container.setAttribute("role", "region");
    container.setAttribute("aria-label", labels.label);
    container.setAttribute("aria-describedby", labels.helpId);
    // Tab の順を「地図の枠 → ＋ － → 印」にする（Leaflet は操作部を印のあとに置く）
    const controls = container.querySelector(".leaflet-control-container");
    if (controls) container.prepend(controls);

    container.addEventListener("keydown", (event) => {
      const pin = event.target instanceof Element ? event.target.closest(".pin-icon") : null;
      if (pin && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        select(pin.dataset.id);
      } else if (event.key === "Escape") {
        clearSelection();
        container.focus();
      }
    });

    layer = L.layerGroup().addTo(map);
    tileLayer = new (quietTileLayer(L))(TILE_URL, {
      minZoom: MAP_MIN_ZOOM,
      maxZoom: MAP_MAX_ZOOM,
      detectRetina: false,
      updateWhenZooming: false,
    });
    tileLoaded = 0;
    tileErrors = 0;
    tileLayer.on("tileload", () => {
      if (gen !== generation) return;
      tileLoaded += 1;
      if (status === "loading") {
        clearTimeout(timer);
        setStatus("ready");
      }
    });
    tileLayer.on("tileerror", () => {
      if (gen === generation) tileErrors += 1;
    });
    tileLayer.on("load", () => {
      // 見える範囲のタイルが終わって、成功が0で失敗がある：8秒を待たずに失敗にする
      // load のイベントの途中で地図を壊すと Leaflet が例外を出すので、1つあとに回す
      if (gen === generation && status === "loading" && tileLoaded === 0 && tileErrors > 0) {
        setTimeout(() => {
          if (gen === generation && status === "loading" && tileLoaded === 0) fail();
        }, 0);
      }
    });
    apply(); // 見える範囲を決めてからタイルを足す（最初に別のズームのタイルを取らない）
    tileLayer.addTo(map);
    timer = setTimeout(() => {
      if (gen === generation && status === "loading" && tileLoaded === 0) fail();
    }, MAP_TILE_TIMEOUT_MS);
  }

  function start() {
    generation += 1;
    const gen = generation;
    status = "loading";
    onStatus("loading");
    loadLeaflet().then(
      (leaflet) => {
        if (gen !== generation) return;
        L = leaflet;
        try {
          build(gen);
        } catch {
          if (gen === generation) fail();
        }
      },
      () => {
        if (gen === generation) fail();
      },
    );
  }

  function select(id) {
    const entry = markers.get(id);
    if (!entry || !map) return;
    const previous = selectedId;
    selectedId = id;
    if (previous && previous !== id) decorate(previous);
    decorate(id);
    map.setView([entry.point.lat, entry.point.lon], Math.max(map.getZoom(), MAP_SINGLE_ZOOM), { animate: false });
    onSelect(id);
  }

  function clearSelection() {
    const previous = selectedId;
    selectedId = null;
    if (previous) decorate(previous);
    onSelect(null);
  }

  return {
    // points：位置のある件 { id, lat, lon, ... }。numbers：id → 番号。refit：絞り込みを変えたときだけ true
    update({ points, numbers, selectedId: next, refit }) {
      pending = { points, numbers, selectedId: next, refit: refit || pending.refit };
      apply();
    },
    select,
    clearSelection,
    focusMap() {
      map?.getContainer().focus();
    },
    invalidate() {
      map?.invalidateSize({ animate: false });
    },
    start,
    // 「地図を再読み込み」。読めていなければ leaflet.js から取り直す
    reload() {
      start();
    },
    destroy() {
      generation += 1;
      clearTimeout(timer);
      if (map) map.remove();
      map = null;
    },
    getStatus: () => status,
  };
}
