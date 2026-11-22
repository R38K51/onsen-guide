import test from "node:test";
import assert from "node:assert/strict";
import { t, setLang, setStrict, getLang, detectLang, DICTIONARIES } from "../src/i18n.js";

test("ja と en のキーが完全に一致する", () => {
  assert.deepEqual(Object.keys(DICTIONARIES.ja).sort(), Object.keys(DICTIONARIES.en).sort());
});

test("t：置き換えと言語の切り替え", () => {
  setLang("ja");
  assert.equal(t("list.heading", { n: 3 }), "温泉地（3件）");
  setLang("en");
  assert.equal(t("list.heading", { n: 3 }), "Onsen Areas (3)");
  assert.equal(t("card.link", { publisher: "Sample" }), "Check on the official page (Sample, external site)");
  assert.equal(getLang(), "en");
  setLang("ja");
});

test("t：キーがないとき、strict では例外、公開ではキーを返す", () => {
  setStrict(true);
  assert.throws(() => t("no.such.key"), /missing i18n key/);
  setStrict(false);
  assert.equal(t("no.such.key"), "no.such.key");
});

test("detectLang：URL、ブラウザの言語の順", () => {
  assert.equal(detectLang("en", "ja-JP"), "en");
  assert.equal(detectLang(null, "ja-JP"), "ja");
  assert.equal(detectLang(null, "fr-FR"), "en");
  assert.equal(detectLang("xx", "ja"), "ja");
  assert.equal(detectLang(null, undefined), "en");
});
