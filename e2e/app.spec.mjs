import AxeBuilder from "@axe-core/playwright";
import { LANGS, SIZES, expect, openApp, test, waitReady } from "./helpers.mjs";

const HEADING = {
  ja: (n) => `温泉地（${n}件）`,
  en: (n) => `Onsen Areas (${n})`,
};
const EMPTY_TITLE = {
  ja: "この条件に合う温泉地は、いま収録している範囲にありません。",
  en: "No onsen areas match these filters in the current collection.",
};

async function overflowReport(page) {
  return page.evaluate(() => {
    const out = [];
    const root = document.documentElement;
    if (root.scrollWidth > root.clientWidth) out.push(`page ${root.scrollWidth}>${root.clientWidth}`);
    for (const el of document.querySelectorAll("button, h1, h2, h3, .tag, .card, a, p, td, th, select, label")) {
      if (el.closest("[hidden]")) continue;
      if (getComputedStyle(el).display === "inline") continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName}.${el.className} ${el.scrollWidth}>${el.clientWidth}`);
    }
    return out;
  });
}

async function smallTargets(page) {
  return page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll("button, a, select")) {
      if (el.classList.contains("skip-link") || el.closest("[hidden]")) continue;
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.height < 43.5 || r.width < 43.5) out.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    return out;
  });
}

async function seriousViolations(page) {
  const results = await new AxeBuilder({ page }).analyze();
  return results.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => `${v.id} (${v.impact}): ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
}

for (const size of SIZES) {
  for (const lang of LANGS) {
    test.describe(`幅 ${size.name} ${lang}`, () => {
      test.use({ viewport: { width: size.width, height: size.height } });

      test("画面A：横スクロールなし、はみ出しなし、押せるものは44px以上", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        expect(await overflowReport(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
        await page.locator("button.chip").nth(9).click(); // 名前がいちばん長い札（放射能泉。英語は Radioactive spring (radon)）
        await expect(page.locator("section.panel")).toBeVisible();
        expect(await overflowReport(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
      });

      test("画面B：横スクロールなし、はみ出しなし、押せるものは44px以上", async ({ page }) => {
        await openApp(page, `#/about?lang=${lang}`);
        await expect(page.locator(".area-table tbody tr")).toHaveCount(10);
        expect(await overflowReport(page)).toEqual([]);
        expect(await smallTargets(page)).toEqual([]);
      });

      test("帯の言語切り替えは1行におさまる", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        for (const button of await page.locator("button[data-lang]").all()) {
          const box = await button.boundingBox();
          expect(box.height).toBeLessThan(60);
        }
      });

      test("配置：札と温泉地カードの列数、左の列の固定", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const cols = await page.evaluate(() => {
          const distinct = (sel) => new Set([...document.querySelectorAll(sel)].map((e) => Math.round(e.getBoundingClientRect().x))).size;
          return {
            chips: distinct("button.chip"),
            cards: distinct(".card"),
            sticky: getComputedStyle(document.querySelector(".filters")).position,
            fits: document.querySelector(".filters").offsetHeight + 32 <= window.innerHeight,
            filtersX: document.querySelector(".filters").getBoundingClientRect().x,
            resultsX: document.querySelector(".results").getBoundingClientRect().x,
            pageWidth: Math.round(document.querySelector(".page").getBoundingClientRect().width),
          };
        });
        const expected = { 390: [2, 1], 768: [3, 2], 1366: [2, 2], 1920: [2, 2] }[size.name];
        expect([cols.chips, cols.cards]).toEqual(expected);
        if (size.width >= 1280) {
          expect(cols.sticky).toBe(cols.fits ? "sticky" : "static");
          expect(cols.filtersX).toBeLessThan(cols.resultsX);
          expect(cols.pageWidth).toBeLessThanOrEqual(1120);
        } else {
          expect(cols.sticky).toBe("static");
        }
      });

      test("札：押す、件数と説明が変わる、解除、都道府県と AND、札の件数は動かない", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const chips = page.locator("button.chip");
        await expect(chips).toHaveCount(10);
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](10));
        await expect(page.locator("section.panel")).toHaveCount(0);
        await expect(page.getByRole("button", { name: lang === "ja" ? "条件を消す" : "Clear Filters" })).toBeHidden();

        const simple = chips.nth(0);
        await simple.click();
        await expect(simple).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](2));
        await expect(page.locator("section.panel")).toBeVisible();
        await expect(page.locator("section.panel .notice p")).toHaveCount(2);
        expect(page.url()).toContain("type=simple");
        const countText = await simple.locator(".count").innerText();

        await page.locator("#pref-select").selectOption("oita");
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](1));
        expect(page.url()).toContain("pref=oita");
        expect(await simple.locator(".count").innerText()).toBe(countText);
        await expect(page.locator(".card")).toHaveCount(1);
        await expect(page.locator(".tag.is-selected")).toHaveCount(1);

        await simple.click();
        await expect(simple).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("section.panel")).toHaveCount(0);
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](2));
        expect(page.url()).not.toContain("type=");

        const clear = page.locator(".filter-row button");
        await expect(clear).toBeVisible();
        await clear.click();
        await expect(clear).toBeHidden();
        await expect(page.locator("#pref-select")).toHaveValue("");
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](10));
      });

      test("空の状態と0件の種類：行き止まりにならない", async ({ page }) => {
        await openApp(page, `#/?type=iron&pref=hokkaido&lang=${lang}`);
        await expect(page.getByText(EMPTY_TITLE[lang])).toBeVisible();
        await expect(page.locator("section.panel")).toBeVisible();
        await page.locator(".results .state-box button").click();
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](10));

        await page.locator("button.chip").nth(9).click(); // 放射能泉：0件
        await expect(page.getByText(EMPTY_TITLE[lang])).toBeVisible();
        await expect(page.locator("section.panel")).toBeVisible();
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](0));
      });

      test("10種類に分類できない泉質名：公式ページの表記には出るが、タグにも札の件数にも出ない", async ({ page }) => {
        await openApp(page, `#/?pref=oita&lang=${lang}`);
        await waitReady(page);
        const card = page.locator(".card", { hasText: "イータ温泉" });
        await expect(card.locator(".official")).toContainText("テスト用の分類できない泉質名");
        await expect(card.locator(".tags li")).toHaveCount(0);
        await expect(card.locator("ul")).toHaveCount(0);
        await expect(page.locator("button.chip")).toHaveCount(10);
      });

      test("URL の復元：直接開く、戻る、進む", async ({ page }) => {
        await openApp(page, `#/?type=sulfur&pref=gunma&lang=${lang}`);
        await waitReady(page);
        await expect(page.locator("button.chip").nth(8)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("#pref-select")).toHaveValue("gunma");
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](1));
        await expect(page.locator("html")).toHaveAttribute("lang", lang);

        await page.locator("button.chip").nth(4).click(); // 二酸化炭素泉
        await expect(page.locator("button.chip").nth(8)).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("button.chip").nth(4)).toHaveAttribute("aria-pressed", "true");
        await page.goBack();
        await expect(page.locator("button.chip").nth(8)).toHaveAttribute("aria-pressed", "true");
        await expect(page.locator("button.chip").nth(4)).toHaveAttribute("aria-pressed", "false");
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](1));
        await page.goForward();
        await expect(page.locator("button.chip").nth(4)).toHaveAttribute("aria-pressed", "true");
      });

      test("不正な URL の値は無視して初期状態", async ({ page }) => {
        await openApp(page, `#/?type=gold&pref=atlantis&lang=${lang}`);
        await waitReady(page);
        await expect(page.locator("button[aria-pressed=true].chip")).toHaveCount(0);
        await expect(page.locator("#results-heading")).toHaveText(HEADING[lang](10));
        expect(new URL(page.url()).hash).toBe(`#/?lang=${lang}`);
      });

      test("最初の画面に3つの注意：非公式、独自の訳、医療の助言ではない", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const text = await page.locator("body").innerText();
        const expected = {
          ja: ["非公式", "独自の訳", "医療の助言ではありません"],
          en: ["Unofficial", "our own translations", "Not medical advice"],
        }[lang];
        for (const word of expected) expect(text).toContain(word);
        await expect(page.locator("section.panel")).toHaveCount(0);
      });

      test("条件を消す：押したあとフォーカスは都道府県の選択に移る", async ({ page }) => {
        await openApp(page, `#/?type=simple&lang=${lang}`);
        await waitReady(page);
        await page.locator(".filter-row button").click();
        await expect(page.locator(".filter-row button")).toBeHidden();
        await expect(page.locator("#pref-select")).toBeFocused();
      });

      test("公式リンクの文字は1つの塊として折り返す（子が横に並ばない）", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const bad = await page.evaluate(() => {
          const out = [];
          for (const a of document.querySelectorAll(".source-link")) {
            const d = getComputedStyle(a).display;
            if (d.includes("flex") || d.includes("grid")) out.push(`display ${d}`);
            const spanTop = a.querySelector("span[lang]").getBoundingClientRect();
            const text = a.getBoundingClientRect();
            if (a.getClientRects().length < 1 || spanTop.left < text.left - 1) out.push("layout");
          }
          return out;
        });
        expect(bad).toEqual([]);
        await page.goto("/#/about?lang=" + lang);
        const d2 = await page.evaluate(() =>
          [...document.querySelectorAll(".ref-link, .area-table a")].map((a) => getComputedStyle(a).display),
        );
        expect(d2.length).toBeGreaterThan(0);
        for (const d of d2) expect(d).toBe("inline");
      });

      test("キーボードだけ：Tab の順、Space と Enter、フォーカスの輪", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const kinds = [];
        let outline = "";
        for (let i = 0; i < 17; i += 1) {
          await page.keyboard.press("Tab");
          const info = await page.evaluate(() => {
            const a = document.activeElement;
            let kind = a.tagName;
            if (a.classList.contains("skip-link")) kind = "skip";
            else if (a.classList.contains("site-name")) kind = "site";
            else if (a.dataset.lang) kind = `lang:${a.dataset.lang}`;
            else if (a.dataset.route === "about") kind = "about";
            else if (a.classList.contains("chip")) kind = "chip";
            else if (a.tagName === "SELECT") kind = "select";
            else if (a.classList.contains("source-link")) kind = "link";
            return { kind, outline: getComputedStyle(a).outlineWidth };
          });
          kinds.push(info.kind);
          outline = info.outline;
        }
        expect(kinds).toEqual(["skip", "site", "lang:ja", "lang:en", "about", ...Array(10).fill("chip"), "select", "link"]);
        expect(outline).toBe("3px");

        const first = page.locator("button.chip").first();
        await first.focus();
        await page.keyboard.press("Space");
        await expect(first).toHaveAttribute("aria-pressed", "true");
        await expect(first).toBeFocused();
        await page.keyboard.press("Enter");
        await expect(first).toHaveAttribute("aria-pressed", "false");
        await expect(first).toBeFocused();
      });

      test("日英の切り替え：URL、html の lang、状態の保持、フォーカス", async ({ page }) => {
        const other = lang === "ja" ? "en" : "ja";
        await openApp(page, `#/?type=acid&lang=${lang}`);
        await waitReady(page);
        const switcher = page.locator(`button[data-lang=${other}]`);
        await switcher.click();
        await expect(page.locator("html")).toHaveAttribute("lang", other);
        expect(page.url()).toContain(`lang=${other}`);
        expect(page.url()).toContain("type=acid");
        await expect(switcher).toHaveAttribute("aria-pressed", "true");
        await expect(switcher).toBeFocused();
        await expect(page.locator("#results-heading")).toHaveText(HEADING[other](1));
        await expect(page.locator("button.chip").nth(6)).toHaveAttribute("aria-pressed", "true"); // 酸性泉
        const title = await page.title();
        expect(title).toContain(other === "ja" ? "温泉探し" : "Onsen Finder");
      });

      test("読み込み中：200ms を超えたときだけ出る", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`, { delay: 1200 });
        await expect(page.getByRole("status")).toHaveText(lang === "ja" ? "読み込み中…" : "Loading…");
        await expect(page.locator("button.chip")).toHaveCount(10);
        await waitReady(page);
        await expect(page.getByRole("status")).toHaveCount(0);
      });

      test("読み込みの失敗：alert と再読み込み、札と説明は出す", async ({ page, monitor }) => {
        monitor.allowConsoleErrors = true;
        await openApp(page, `#/?type=sulfur&lang=${lang}`, { fail: true });
        const alert = page.getByRole("alert");
        await expect(alert).toBeVisible();
        await expect(alert.getByRole("button")).toHaveText(lang === "ja" ? "再読み込み" : "Reload");
        await expect(page.locator("button.chip")).toHaveCount(10);
        await expect(page.locator("section.panel")).toBeVisible();
        expect(await overflowReport(page)).toEqual([]);
      });

      test("画面Bへの移動：見出しにフォーカス、環境省の2点は画面Bだけ", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        await expect(page.locator('a[href*="env.go.jp"]')).toHaveCount(0);
        await page.locator("a[data-route=about]").click();
        await expect(page.locator("h1")).toHaveText(lang === "ja" ? "このサイトについて" : "About This Site");
        await expect(page.locator("h1")).toBeFocused();
        expect(page.url()).toContain("#/about");
        expect(page.url()).toContain(`lang=${lang}`);
        await expect(page.locator('a[href*="env.go.jp"]')).toHaveCount(2);
        for (const link of await page.locator("main a[target=_blank]").all()) {
          await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        }
        await page.goBack();
        await expect(page.locator("button.chip")).toHaveCount(10);
        await expect(page.locator("h1")).toBeFocused();
      });

      test("カードの外部リンク：新しいタブ、ラベルに外部サイト、押さない", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        const link = page.locator(".source-link").first();
        await expect(link).toHaveAttribute("target", "_blank");
        await expect(link).toHaveAttribute("rel", "noopener noreferrer");
        await expect(link).toHaveAttribute("href", /^https:\/\/example\.invalid\//);
        await expect(link).toContainText(lang === "ja" ? "外部サイト" : "external site");
      });

      test("省動作：色の切り替えも即時", async ({ page }) => {
        await page.emulateMedia({ reducedMotion: "reduce" });
        await openApp(page, `#/?lang=${lang}`);
        const duration = await page.locator("button.chip").first().evaluate((e) => getComputedStyle(e).transitionDuration);
        expect(duration).toBe("0s");
      });

      test("axe：画面A、説明パネルつき、画面B に重大な違反なし", async ({ page }) => {
        await openApp(page, `#/?lang=${lang}`);
        await waitReady(page);
        expect(await seriousViolations(page)).toEqual([]);
        await page.locator("button.chip").nth(3).click();
        await expect(page.locator("section.panel")).toBeVisible();
        // 色の切り替え（0.15秒）が終わってから測る
        await expect(page.locator("button.chip").nth(3)).toHaveCSS("background-color", "rgb(15, 94, 99)");
        await expect(page.locator("button.chip").nth(3)).toHaveCSS("color", "rgb(255, 255, 255)");
        expect(await seriousViolations(page)).toEqual([]);
        await page.goto(`/index.html#/about?lang=${lang}`);
        await expect(page.locator(".area-table tbody tr")).toHaveCount(10);
        expect(await seriousViolations(page)).toEqual([]);
      });
    });
  }
}

test.describe("幅 390 の最初の画面", () => {
  test.use({ viewport: { width: 390, height: 844 } });
  test("h1、導入文、札の4個以上が最初の画面に見える", async ({ page }) => {
    await openApp(page, "#/?lang=ja");
    await waitReady(page);
    const visible = await page.evaluate(() => {
      const inView = (e) => e.getBoundingClientRect().bottom <= window.innerHeight;
      return {
        h1: inView(document.querySelector("h1")),
        lead: inView(document.querySelector("#lead")),
        chips: [...document.querySelectorAll("button.chip")].filter(inView).length,
      };
    });
    expect(visible.h1 && visible.lead).toBe(true);
    expect(visible.chips).toBeGreaterThanOrEqual(4);
  });
});

for (const lang of LANGS) {
  test.describe(`幅 390 で札を押した後（${lang}）`, () => {
    test.use({ viewport: { width: 390, height: 844 } });
    test("説明パネルがビューポートに入り、フォーカスは札のまま", async ({ page }) => {
      await openApp(page, `#/?lang=${lang}`);
      await waitReady(page);
      await page.emulateMedia({ reducedMotion: "reduce" });
      const chip = page.locator("button.chip").nth(0);
      await chip.click();
      const panel = page.locator("section.panel");
      await expect(panel).toBeVisible();
      await expect
        .poll(() => page.evaluate(() => {
          const r = document.querySelector("section.panel").getBoundingClientRect();
          return r.top >= 0 && r.top < window.innerHeight - 100;
        }))
        .toBe(true);
      await expect(chip).toBeFocused();
      const y = await page.evaluate(() => window.scrollY);
      await chip.click();
      await expect(panel).toHaveCount(0);
      expect(await page.evaluate(() => window.scrollY)).toBeLessThanOrEqual(y);
    });
  });
}
