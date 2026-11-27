// 絞り込み、並び順、件数（純粋な関数。DOM を使わない）。
import { TYPE_IDS } from "./constants.js";
import { PREFECTURES } from "./prefectures.js";

const collator = new Intl.Collator("ja");

// 温泉地の泉質タグ（springs の type の重複を除き、TYPE_IDS の順に並べる）
export function areaTypes(area) {
  const set = new Set(area.springs.map((s) => s.type));
  return TYPE_IDS.filter((id) => set.has(id));
}

// 「公式ページの表記」：official の重複を除く
export function officialNames(area) {
  return [...new Set(area.springs.map((s) => s.official))];
}

// 並び：都道府県は北から南、同じ県の中は nameKana の五十音
export function sortAreas(areas) {
  return [...areas].sort((a, b) => {
    const byPref = PREFECTURES.indexOf(a.prefecture) - PREFECTURES.indexOf(b.prefecture);
    if (byPref !== 0) return byPref;
    return collator.compare(a.nameKana, b.nameKana) || collator.compare(a.id, b.id);
  });
}

// type と pref は AND。type は複数タグのどれか1つに当たれば出る
export function filterAreas(areas, { type = null, pref = null } = {}) {
  return sortAreas(areas).filter(
    (area) => (!type || areaTypes(area).includes(type)) && (!pref || area.prefecture === pref),
  );
}

// 札の件数（全件に対する件数。都道府県の選択とは連動しない）
export function countByType(areas) {
  const counts = Object.fromEntries(TYPE_IDS.map((id) => [id, 0]));
  for (const area of areas) for (const id of areaTypes(area)) counts[id] += 1;
  return counts;
}

// データにある都道府県だけ（北から南）
export function prefecturesIn(areas) {
  const set = new Set(areas.map((a) => a.prefecture));
  return PREFECTURES.filter((id) => set.has(id));
}

// 地図の印と、カードの番号：全件を並び順に並べたときの順位（1始まり）。絞り込んでも変わらない
export function pinNumbers(areas) {
  return new Map(sortAreas(areas).map((area, i) => [area.id, i + 1]));
}

export function formatPinNumber(n) {
  return String(n).padStart(2, "0");
}

// 見える範囲の決め方。points は位置のある件（{ lat, lon }）。余白と最大ズームは src/map.js が指定する
export function mapView(points) {
  if (points.length === 0) return { mode: "none" };
  if (points.length === 1) return { mode: "single", center: [points[0].lat, points[0].lon] };
  const lats = points.map((p) => p.lat);
  const lons = points.map((p) => p.lon);
  return {
    mode: "fit",
    bounds: [[Math.min(...lats), Math.min(...lons)], [Math.max(...lats), Math.max(...lons)]],
  };
}
