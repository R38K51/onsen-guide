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
