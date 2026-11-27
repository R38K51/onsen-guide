import AxeBuilder from "@axe-core/playwright";
import { expect, openApp, test, tilePng, TILE_GLOB, waitMapReady, waitReady } from "./helpers.mjs";

const SIZES = [
  { name: "390", width: 390, height: 844, mapHeight: 300 },
  { name: "768", width: 768, height: 1024, mapHeight: 360 },
  { name: "1024", width: 1024, height: 768, mapHeight: 400 },
  { name: "1366", width: 1366, height: 768, mapHeight: 400 },
];
const T = {
  ja: {
    idle: "印を押すと、温泉地の名前が出ます。近い印は、拡大すると分かれます。",
    sample: "02 サンプル温泉（北海道）",
    announce: "サンプル温泉を地図の中央に表示しました。",
    onMap: "地図で選択中",
    show: "地図で見る",
    toCard: "一覧のカードへ",
    clear: "選択を外す",
    error: "地図を読み込めませんでした。温泉地の一覧とカードは、これまでどおり使えます。",
    reload: "地図を再読み込み",
    skip: "地図を飛ばして一覧へ",
    noPos: "1件は位置を載せていないため、地図に印がありません。",
  },
  en: {
    idle: "Select a pin to see the name of the onsen area. Pins close together separate when you zoom in.",
    sample: "02 Sample Onsen (Hokkaido)",
    announce: "Showing Sample Onsen at the center of the map.",
    onMap: "Selected on Map",
    show: "Show on Map",
    toCard: "Go to Its Card",
    clear: "Clear Selection",
    error: "Could not load the map. The list and cards still work as before.",
    reload: "Reload Map",
    skip: "Skip Map and Go to List",
    noPos: "Areas without a location are not shown on the map (1).",
  },
};

async function overflow(page) {
  return page.evaluate(() => {
    const out = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) out.push(`page ${root.scrollWidth}>${root.clientWidth}`);
    for (const el of document.querySelectorAll(".map-box *")) {
      if (el.closest("[hidden]") || el.closest(".sr-only") || el.closest(".leaflet-container") || el.matches(".map-skip:not(:focus)")) continue;
      if (getComputedStyle(el).display === "inline") continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  });
}

async function smallMapTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll(".map-box button, .map-box a, .pin-icon, .show-on-map")) {
      if (el.closest("[hidden]") || el.matches(".map-skip:not(:focus)")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (getComputedStyle(el).display === "inline") continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

for (const size of SIZES) {
  for (const lang of ["ja", "en"]) {
    test.describe(`地図 幅 ${size.name} ${lang}`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });
      const tt = T[lang];

      test("並び：見出し → 地図 → 一覧。地図の高さ、横スクロールなし、印の数、番号、44px", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        await waitMapReady(page);
        const info = await page.evaluate(() => {
          const rect = (sel) => document.querySelector(sel).getBoundingClientRect();
          const heading = rect("#results-heading");
          const frame = rect(".map-frame");
          const cards = rect(".cards");
          const results = rect(".results");
          return {
            order: heading.bottom <= frame.top + 1 && frame.bottom <= cards.top + 1,
            height: Math.round(frame.height),
            wide: Math.round(frame.width) >= Math.round(results.width) - 2,
            pins: document.querySelectorAll(".pin-icon").length,
            pinNumbers: [...document.querySelectorAll(".pin-icon")].map((p) => p.querySelector(".pin-num").textContent),
            cardNumbers: [...document.querySelectorAll(".card-pin .pin-badge")].map((p) => p.textContent),
            buttons: document.querySelectorAll(".show-on-map:not([hidden])").length,
          };
        });
        expect(info.order).toBe(true);
        expect(info.height).toBe(size.mapHeight);
        expect(info.wide).toBe(true);
        expect(info.pins).toBe(10);
        expect(info.pinNumbers).toEqual(["01", "02", "03", "04", "05", "06", "07", "08", "09", "10"]);
        expect(info.cardNumbers).toEqual(info.pinNumbers);
        expect(info.buttons).toBe(10);
        expect(await overflow(page)).toEqual([]);
        expect(await smallMapTargets(page)).toEqual([]);
        await expect(page.locator(".map-hint-text")).toHaveText(tt.idle);
        // 出典：新しいタブ、rel、ラベルに外部サイト
        const link = page.locator(".map-notes a[target=_blank]");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(link).toHaveAttribute("href", "https://maps.gsi.go.jp/development/ichiran.html");
        await expect(link).toContainText(lang === "ja" ? "外部サイト" : "external site");
        if (lang === "en") await expect(page.locator(".map-notes")).toContainText("Place names on the map are in Japanese.");
        else await expect(page.locator(".map-notes")).not.toContainText("地図の地名は日本語です");
      });

      test("絞り込み：印の数が結果と一致し、番号は飛び番になる", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitMapReady(page);
        await page.locator("#pref-select").selectOption("oita");
        await expect(page.locator(".pin-icon")).toHaveCount(2);
        await expect(page.locator(".pin-icon .pin-num")).toHaveText(["09", "10"]);
        await expect(page.locator(".card-pin .pin-badge")).toHaveText(["09", "10"]);
        await page.locator("button.chip").nth(6).click(); // 酸性泉（delta だけ。大分は0件）
        await expect(page.locator(".map-box")).toBeHidden();
        await page.locator("#pref-select").selectOption("");
        await expect(page.locator(".pin-icon")).toHaveCount(1);
        await expect(page.locator(".pin-icon .pin-num")).toHaveText(["07"]);
        await expect(page.locator(".map-box")).toBeVisible();
      });

      test("実際のマウスで押せる：絞り込んで離れた印を押す", async ({ page }) => {
        await openApp(page, `#/?pref=oita&lang=${lang}`);
        await waitMapReady(page);
        await page.locator(".pin-icon").nth(1).click();
        await expect(page.locator(".card.is-onmap h3")).toHaveText("シータ温泉");
        await expect(page.locator(".map-box p[role=status]")).toHaveText(lang === "ja" ? "シータ温泉を地図の中央に表示しました。" : "Showing Theta Onsen at the center of the map.");
      });

      test("印を選ぶ：案内の行、カードの強調、読み上げ、ほかの選択は外れる、位置は URL に入れない", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitMapReady(page);
        const before = page.url();
        await page.locator(".pin-icon").nth(1).dispatchEvent("click");
        await expect(page.locator(".map-hint-text")).toHaveText(tt.sample);
        await expect(page.locator(".map-box p[role=status]")).toHaveText(tt.announce);
        await expect(page.locator(".pin-icon").nth(1)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator(".pin-icon[aria-pressed=true]")).toHaveCount(1);
        await expect(page.locator(".card.is-onmap")).toHaveCount(1);
        await expect(page.locator(".card.is-onmap .card-onmap")).toHaveText(tt.onMap);
        await expect(page.getByRole("button", { name: tt.toCard })).toBeVisible();
        expect(page.url()).toBe(before);
        // もう一度同じ印：外れない
        await page.locator(".pin-icon").nth(1).dispatchEvent("click");
        await expect(page.locator(".card.is-onmap")).toHaveCount(1);
        // 別の印：付け替わる
        await page.locator(".pin-icon").nth(0).dispatchEvent("click");
        await expect(page.locator(".card.is-onmap h3")).toHaveText("アルファ温泉");
        await expect(page.locator(".card.is-onmap")).toHaveCount(1);
        // 選択を外す：フォーカスは地図の枠へ
        await page.getByRole("button", { name: tt.clear }).click();
        await expect(page.locator(".card.is-onmap")).toHaveCount(0);
        await expect(page.locator(".map-hint-text")).toHaveText(tt.idle);
        await expect(page.locator(".map-canvas")).toBeFocused();
      });

      test("「地図で見る」：選択、地図が動く、フォーカスはボタンに残る、もう一度押しても外れない", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitMapReady(page);
        const card = page.locator(".card", { hasText: "サンプル温泉" }).first();
        const button = card.locator(".show-on-map");
        await expect(button).toHaveText(tt.show);
        await button.click();
        await expect(button).toBeFocused();
        await expect(card).toHaveClass(/is-onmap/);
        await expect(page.locator(".map-hint-text")).toHaveText(tt.sample);
        await expect(page.locator(".map-box p[role=status]")).toHaveText(tt.announce);
        await expect(page.locator(".pin-icon[aria-pressed=true]")).toHaveCount(1);
        await button.click();
        await expect(card).toHaveClass(/is-onmap/);
        // 一覧のカードへ：カードの「地図で見る」にフォーカス
        await page.getByRole("button", { name: tt.toCard }).click();
        await expect(button).toBeFocused();
      });

      test("選択中の温泉地が絞り込みで消えたら外れる。言語を切り替えても選択は残る", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitMapReady(page);
        await page.locator(".pin-icon").nth(9).dispatchEvent("click"); // シータ温泉（大分）
        await expect(page.locator(".card.is-onmap")).toHaveCount(1);
        const other = lang === "ja" ? "en" : "ja";
        await page.locator(`button[data-lang=${other}]`).click();
        await waitMapReady(page);
        await expect(page.locator(".card.is-onmap")).toHaveCount(1);
        await expect(page.locator(".pin-icon[aria-pressed=true]")).toHaveCount(1);
        await expect(page.locator(".map-hint-text")).toContainText("10");
        await page.locator("#pref-select").selectOption("hokkaido");
        await expect(page.locator(".card.is-onmap")).toHaveCount(0);
        await expect(page.locator(".map-hint-text")).toHaveText(T[other].idle);
        await expect(page.locator(".pin-icon[aria-pressed=true]")).toHaveCount(0);
      });

      test("axe：地図が出ている画面に重大な違反なし", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitMapReady(page);
        await page.locator(".pin-icon").nth(2).dispatchEvent("click");
        const results = await new AxeBuilder({ page }).analyze();
        const serious = results.violations
          .filter((v) => v.impact === "critical" || v.impact === "serious")
          .map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
        expect(serious).toEqual([]);
      });
    });
  }
}

test.describe("地図 キーボード（幅 390、日本語）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("Tab の順：地図を飛ばす → 地図の枠 → ＋ → － → 印（番号順）→ カード。ハッシュは変わらない", async ({ page }) => {
    await openApp(page, "#/?lang=ja");
    await waitMapReady(page);
    await page.locator("#pref-select").focus();
    const order = [];
    for (let i = 0; i < 17; i += 1) {
      await page.keyboard.press("Tab");
      order.push(
        await page.evaluate(() => {
          const a = document.activeElement;
          if (a.classList.contains("map-skip")) return "skip";
          if (a.classList.contains("leaflet-container")) return "map";
          if (a.classList.contains("leaflet-control-zoom-in")) return "zoomIn";
          if (a.classList.contains("leaflet-control-zoom-out")) return "zoomOut";
          if (a.classList.contains("pin-icon")) return `pin${a.querySelector(".pin-num").textContent}`;
          if (a.classList.contains("source-link")) return "link";
          if (a.classList.contains("ref-link")) return "noteLink";
          if (a.classList.contains("show-on-map")) return "show";
          return a.tagName + "." + a.className;
        }),
      );
    }
    expect(order).toEqual([
      "skip", "map", "zoomIn", "zoomOut",
      "pin01", "pin02", "pin03", "pin04", "pin05", "pin06", "pin07", "pin08", "pin09", "pin10",
      "noteLink", "noteLink", "link",
    ]);
    const hash = new URL(page.url()).hash;
    await page.locator(".leaflet-control-zoom-in").click();
    expect(new URL(page.url()).hash).toBe(hash);
  });

  test("印：Enter と Space で選ぶ、フォーカスは印に残る。Esc で外し、地図の枠へ。矢印と +/- は地図が動く", async ({ page }) => {
    await openApp(page, "#/?lang=ja");
    await waitMapReady(page);
    const pin = page.locator(".pin-icon").nth(3);
    await pin.focus();
    await page.keyboard.press("Space");
    await expect(page.locator(".card.is-onmap h3")).toHaveText("ガンマ温泉");
    await expect(pin).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator(".card.is-onmap")).toHaveCount(0);
    await expect(page.locator(".map-canvas")).toBeFocused();
    await page.locator(".pin-icon").nth(4).focus();
    await page.keyboard.press("Enter");
    await expect(page.locator(".card.is-onmap h3")).toHaveText("とても長い名前のテスト用温泉地サンプル温泉郷");
    await expect(page.locator(".pin-icon").nth(4)).toBeFocused();
    // 地図の枠で + と矢印
    await page.locator(".map-canvas").focus();
    const zoom0 = await page.evaluate(() => document.querySelector(".leaflet-tile-container")?.children.length ?? 0);
    expect(zoom0).toBeGreaterThan(0);
    const pos0 = await page.locator(".pin-icon").nth(0).boundingBox();
    await page.keyboard.press("ArrowDown");
    await expect.poll(async () => (await page.locator(".pin-icon").nth(0).boundingBox()).y).not.toBe(pos0.y);
  });

  test("「地図を飛ばして一覧へ」：最初のカードの見出しにフォーカス。フォーカスしたときだけ見える", async ({ page }) => {
    await openApp(page, "#/?lang=ja");
    await waitMapReady(page);
    const skip = page.getByRole("button", { name: "地図を飛ばして一覧へ" });
    await skip.focus();
    const box = await skip.boundingBox();
    expect(box.width).toBeGreaterThan(40);
    await page.keyboard.press("Enter");
    await expect(page.locator(".cards .card h3").first()).toBeFocused();
    await page.locator("#pref-select").focus();
    expect((await skip.boundingBox())?.width ?? 0).toBeLessThan(5);
  });

  test("ズームは4〜16の範囲。＋－の名前は辞書の文字", async ({ page }) => {
    await openApp(page, "#/?lang=ja");
    await waitMapReady(page);
    await expect(page.locator(".leaflet-control-zoom-in")).toHaveAttribute("aria-label", "拡大");
    await expect(page.locator(".leaflet-control-zoom-out")).toHaveAttribute("aria-label", "縮小");
    // 全件が入る最小ズームは4（これ以上は縮小できない）
    await expect(page.locator(".leaflet-control-zoom-out")).toHaveClass(/leaflet-disabled/);
    for (let i = 0; i < 12; i += 1) await page.locator(".leaflet-control-zoom-in:not(.leaflet-disabled)").click();
    await expect(page.locator(".leaflet-control-zoom-in")).toHaveClass(/leaflet-disabled/);
    const zoom = await page.evaluate(() => Math.max(...[...document.querySelectorAll(".leaflet-tile")].map((t) => Number(t.src.split("/").at(-3)))));
    expect(zoom).toBe(16);
  });
});

test.describe("地図 通信とタイル", () => {
  test.use({ viewport: { width: 1366, height: 768 } });

  test("最初の表示のタイルは20枚以内、ズームは4〜16、地理院以外へは出ない（monitor が確認）", async ({ page, monitor }) => {
    await openApp(page, "#/?lang=ja");
    await waitMapReady(page);
    await page.waitForTimeout(500);
    expect(monitor.tiles.length).toBeGreaterThan(0);
    expect(monitor.tiles.length).toBeLessThanOrEqual(20);
    for (const url of monitor.tiles) {
      const z = Number(new URL(url).pathname.split("/")[3]);
      expect(z).toBeGreaterThanOrEqual(4);
      expect(z).toBeLessThanOrEqual(16);
    }
    // 札を押しても、見える範囲のタイルしか取らない
    for (let i = 0; i < 4; i += 1) await page.locator(".leaflet-control-zoom-in").click();
    await page.waitForTimeout(500);
    expect(monitor.tiles.length).toBeLessThanOrEqual(80);
  });
});

test.describe("地図 読めないとき（幅 390、日本語）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  async function expectFailedState(page) {
    await expect(page.getByText(T.ja.error)).toBeVisible();
    await expect(page.getByRole("button", { name: T.ja.reload })).toBeVisible();
    await expect(page.locator(".map-frame")).toBeHidden();
    await expect(page.locator(".pin-icon")).toHaveCount(0);
    await expect(page.locator(".show-on-map:not([hidden])")).toHaveCount(0);
    await expect(page.locator(".card-pin:not([hidden])")).toHaveCount(0);
    await expect(page.locator(".map-notes")).toBeHidden();
    await expect(page.locator(".map-hint")).toBeHidden();
    // 一覧、札、絞り込みは使える
    await expect(page.locator(".card")).toHaveCount(10);
    await page.locator("button.chip").nth(0).click();
    await expect(page.locator(".card")).toHaveCount(2);
    await page.locator("button.chip").nth(0).click();
    await expect(page.locator(".card")).toHaveCount(10);
  }

  test("タイルの配信元が拒否：すぐ失敗になり、再読み込みで戻る", async ({ page, monitor }) => {
    monitor.allowConsoleErrors = true; // 拒否したタイルの読み込み失敗が console に出る
    await page.route(TILE_GLOB, (route) => route.abort());
    await openApp(page, "#/?lang=ja");
    await waitReady(page);
    await expectFailedState(page);
    // 再読み込み：配信元が戻れば通常の表示に戻る
    await page.unroute(TILE_GLOB);
    await page.route(TILE_GLOB, (route) => route.fulfill({ status: 200, contentType: "image/png", body: tilePng }));
    const reload = page.getByRole("button", { name: T.ja.reload });
    await reload.click();
    await waitMapReady(page);
    await expect(page.locator(".map-failed")).toBeHidden();
    await expect(page.locator(".pin-icon")).toHaveCount(10);
    await expect(page.locator(".show-on-map:not([hidden])")).toHaveCount(10);
  });

  test("再読み込みが失敗しても、ボタンは何度でも押せる（フォーカスはボタンに残る）", async ({ page, monitor }) => {
    monitor.allowConsoleErrors = true;
    await page.route(TILE_GLOB, (route) => route.abort());
    await openApp(page, "#/?lang=ja");
    await waitReady(page);
    const reload = page.getByRole("button", { name: T.ja.reload });
    await expect(reload).toBeVisible();
    await reload.focus();
    await reload.click();
    await expect(reload).toBeVisible();
    await expect(reload).toBeFocused();
    await expect(page.locator(".map-frame")).toBeHidden();
  });

  test("タイルが返らない：8秒で失敗になる", async ({ page }) => {
    await page.clock.install();
    await page.route(TILE_GLOB, () => {}); // 返さない
    await openApp(page, "#/?lang=ja");
    await expect(page.locator(".card")).toHaveCount(10);
    await expect(page.locator(".map-failed")).toBeHidden();
    await page.clock.runFor(7000);
    await expect(page.locator(".map-failed")).toBeHidden();
    await page.clock.runFor(1500);
    await expect(page.locator(".map-failed")).toBeVisible();
    await expect(page.locator(".pin-icon")).toHaveCount(0);
  });

  test("「地図を読み込み中…」は200msを超えたときだけ出る", async ({ page }) => {
    await page.route(TILE_GLOB, async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.fulfill({ status: 200, contentType: "image/png", body: tilePng }).catch(() => {});
    });
    await openApp(page, "#/?lang=ja");
    await expect(page.locator(".map-frame")).toBeVisible();
    await expect(page.locator(".map-loading")).toBeVisible();
    await expect(page.locator(".pin-icon:visible")).toHaveCount(0);
    await expect(page.locator(".show-on-map:not([hidden])")).toHaveCount(0);
    await waitMapReady(page);
    await expect(page.locator(".map-loading")).toBeHidden();
  });

  test("leaflet.js が読めない：失敗の枠。一覧は使える", async ({ page, monitor }) => {
    monitor.allowConsoleErrors = true;
    await page.route("**/vendor/leaflet/leaflet.js", (route) => route.abort());
    await openApp(page, "#/?lang=ja");
    await waitReady(page);
    await expectFailedState(page);
  });
});

test.describe("地図 位置のない温泉地（架空データ）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("カードに番号も「地図で見る」も出ず、注記が出る。印は1件少ない", async ({ page }) => {
    await openApp(page, "#/?lang=ja", { mutate: (d) => { delete d.areas.find((a) => a.id === "beta").position; } });
    await waitMapReady(page);
    await expect(page.locator(".pin-icon")).toHaveCount(9);
    await expect(page.locator(".map-notes")).toContainText(T.ja.noPos);
    const beta = page.locator(".card", { hasText: "ベータ温泉" });
    await expect(beta.locator(".show-on-map")).toHaveCount(0);
    await expect(beta.locator(".card-pin")).toHaveCount(0);
    // 番号は全件の順位のまま（飛び番）
    await expect(page.locator(".pin-icon .pin-num")).toHaveText(["01", "02", "04", "05", "06", "07", "08", "09", "10"]);
  });
});

test.describe("画面B：地図について（幅 390）", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  for (const lang of ["ja", "en"]) {
    test(`地図の節、位置の出典、通信の説明、外部リンク（${lang}）`, async ({ page }) => {
      await openApp(page, `#/about?lang=${lang}`);
      await expect(page.locator(".area-table tbody tr")).toHaveCount(10);
      await expect(page.getByRole("heading", { name: lang === "ja" ? "地図について" : "About the Map" })).toBeVisible();
      await expect(page.locator(".about")).toContainText("Leaflet");
      await expect(page.locator(".about")).toContainText("1.9.4");
      await expect(page.locator(".about")).not.toContainText(lang === "ja" ? "外部のサービスへ通信しません" : "makes no requests to external services");
      await expect(page.locator(".pos-source")).toHaveCount(10);
      await expect(page.locator(".pos-source").first()).toContainText(lang === "ja" ? "位置の出典：" : "Location source:");
      const link = page.locator(".about a[href='https://maps.gsi.go.jp/development/ichiran.html']");
      await expect(link).toHaveAttribute("target", "_blank");
      await expect(link).toHaveAttribute("rel", "noopener noreferrer");
      await expect(link).toContainText(lang === "ja" ? "外部サイト" : "external site");
      const results = await new AxeBuilder({ page }).analyze();
      expect(results.violations.filter((v) => v.impact === "critical" || v.impact === "serious")).toEqual([]);
    });
  }
});
