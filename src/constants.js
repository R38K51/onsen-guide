// 掲示用泉質名の10種類（温泉法第18条の掲示基準の通知にある順）
export const TYPE_IDS = [
  "simple", "chloride", "bicarbonate", "sulfate", "co2",
  "iron", "acid", "iodine", "sulfur", "radioactive",
];

// 地図（設計書 技術設計 M2）。地理院タイルの URL はここと index.html の CSP の2か所だけに書く
export const LEAFLET_VERSION = "1.9.4";
export const TILE_URL = "https://cyberjapandata.gsi.go.jp/xyz/pale/{z}/{x}/{y}.png"; // 地理院タイル 淡色地図
export const TILE_SOURCE_LIST_URL = "https://maps.gsi.go.jp/development/ichiran.html"; // 出典のリンク先（リンクであり通信ではない）
export const LEAFLET_SCRIPT = "./vendor/leaflet/leaflet.js";
export const MAP_MIN_ZOOM = 4;
export const MAP_MAX_ZOOM = 16;
export const MAP_BOUNDS = [[23, 121], [47, 148]]; // [[南, 西], [北, 東]]
export const MAP_FIT_PADDING = 32;
export const MAP_FIT_PADDING_LEFT = 72; // 左上の「＋」「－」（幅44と余白）に印が重ならないよう、左だけ広げる
export const MAP_FIT_MAX_ZOOM = 10;
export const MAP_SINGLE_ZOOM = 11;
export const MAP_TILE_TIMEOUT_MS = 8000;
export const MAP_LOADING_DELAY_MS = 200;
