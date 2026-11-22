import { readFileSync } from "node:fs";
import { test as base, expect } from "@playwright/test";

export { expect };

export const fixtureJson = readFileSync(new URL("../tests/fixtures/onsen.json", import.meta.url), "utf8");

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
      const consoleErrors = [];
      page.on("request", (req) => {
        if (!req.url().startsWith(origin)) external.push(req.url());
      });
      page.on("console", (msg) => {
        if (msg.type() === "error") consoleErrors.push(msg.text());
      });
      page.on("pageerror", (err) => consoleErrors.push(String(err)));
      await page.addInitScript(() => {
        window.__csp = [];
        document.addEventListener("securitypolicyviolation", (e) => window.__csp.push(`${e.violatedDirective} ${e.blockedURI}`));
      });
      const state = { allowConsoleErrors: false };
      await use(state);
      const violations = await page.evaluate(() => window.__csp ?? []).catch(() => []);
      expect(external, "外部リクエスト").toEqual([]);
      expect(violations, "securitypolicyviolation").toEqual([]);
      if (!state.allowConsoleErrors) expect(consoleErrors, "console エラー").toEqual([]);
    },
    { auto: true },
  ],
});

// 架空データ（tests/fixtures）で開く。data/onsen.json の中身には頼らない
export async function openApp(page, hash = "#/", { delay = 0, fail = false } = {}) {
  await page.route("**/data/onsen.json", async (route) => {
    if (fail) return route.abort();
    if (delay) await new Promise((r) => setTimeout(r, delay));
    return route.fulfill({ status: 200, contentType: "application/json", body: fixtureJson });
  });
  await page.goto(`/index.html${hash}`);
}

export async function waitReady(page) {
  await expect(page.locator(".cards")).toBeVisible();
}
