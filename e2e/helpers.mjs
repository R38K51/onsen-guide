import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";
import { TILE_URL } from "../src/constants.js";

export { expect };

export const fixtureJson = readFileSync(new URL("../tests/fixtures/onsen.json", import.meta.url), "utf8");
export const tilePng = readFileSync(new URL("./fixtures/tile.png", import.meta.url));

// 許可する通信は、起点のオリジンと、地理院タイルの URL の形（src/constants.js の TILE_URL から作る）だけ
const escapeRe = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const digits = "\\d+";
export const TILE_RE = new RegExp(
  `^${escapeRe(TILE_URL).replace(escapeRe("{z}"), digits).replace(escapeRe("{x}"), digits).replace(escapeRe("{y}"), digits)}$`,
);
export const TILE_GLOB = `${new URL(TILE_URL).origin}/**`;

export const SIZES = [
  { name: "390", width: 390, height: 844 },
  { name: "768", width: 768, height: 1024 },
  { name: "1366", width: 1366, height: 768 },
  { name: "1920", width: 1920, height: 1080 },
];
export const LANGS = ["ja", "en"];

// 全リクエストの記録、securitypolicyviolation、console エラーを自動で集め、終わりに 0 件を確かめる
export const test = base.extend({
  monitor: [
    async ({ page, baseURL }, use, testInfo) => {
      const origin = new URL(baseURL).origin;
      const external = [];
      const tiles = [];
      const referers = [];
      const consoleErrors = [];
      page.on("request", (req) => {
        const url = req.url();
        if (url.startsWith(origin)) return;
        if (TILE_RE.test(url)) {
          tiles.push(url);
          if (req.headers().referer) referers.push(req.headers().referer);
        } else external.push(url);
      });
      // 本物の地理院へは取りに行かない。固定の無地のタイルを返す（読めないテストは、あとから route を足して上書きする）
      await page.route(TILE_GLOB, (route) => route.fulfill({ status: 200, contentType: "image/png", body: tilePng }));
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));
      await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const state = { allowConsoleErrors: false, tiles };
      await use(state);
      const violations = await page.evaluate(() => window.__csp ?? []).catch(() => []);
      expect(external, "外部リクエスト").toEqual([]);
      expect(referers, "タイルへの Referer").toEqual([]);
      expect(violations, "securitypolicyviolation").toEqual([]);
      if (!state.allowConsoleErrors) expect(consoleErrors, "console エラー").toEqual([]);
    },
    { auto: true },
  ],
});

// 架空データ（tests/fixtures）で開く。data/onsen.json の中身には頼らない
export async function openApp(page, hash = "#/", { delay = 0, fail = false, mutate = null } = {}) {
  await page.route("**/data/onsen.json", async (route) => {
    if (fail) return route.abort();
    if (delay) await new Promise((r) => setTimeout(r, delay));
    let body = fixtureJson;
    if (mutate) {
      const data = JSON.parse(fixtureJson);
      mutate(data);
      body = JSON.stringify(data);
    }
    return route.fulfill({ status: 200, contentType: "application/json", body });
  });
  await page.goto(`/index.html${hash}`);
}

export async function waitReady(page) {
  await expect(page.locator(".cards")).toBeVisible();
}

// 地図が ready（タイルが1枚見えた）になるまで待つ
export async function waitMapReady(page) {
  await expect(page.locator(".map-box.is-ready")).toBeVisible();
}
