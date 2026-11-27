import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const css = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "../css/style.css"), "utf8");
const color = (name) => css.match(new RegExp(`--${name}:\\s*(#[0-9A-Fa-f]{6})`))[1];

function luminance(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function ratio(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test("文字と地の対比は 4.5:1 以上", () => {
  const pairs = [
    ["color-text", "color-bg"], ["color-text", "color-surface"],
    ["color-text-muted", "color-bg"], ["color-on-primary", "color-primary"],
    ["color-notice-text", "color-notice-bg"], ["color-primary", "color-primary-weak"],
  ];
  for (const [fg, bg] of pairs) {
    const r = ratio(color(fg), color(bg));
    assert.ok(r >= 4.5, `${fg}/${bg} = ${r.toFixed(2)}`);
  }
});

test("押せるものの枠と地の対比は 3:1 以上", () => {
  for (const bg of ["color-bg", "color-surface"]) {
    assert.ok(ratio(color("color-border-control"), color(bg)) >= 3, bg);
  }
  assert.ok(ratio(color("color-focus"), color("color-bg")) >= 3);
});

test("地図：印の字と地は 4.5:1 以上、印の枠と地図の地、地図の枠と地図の地は 3:1 以上", () => {
  const resolve = (name) => {
    const m = css.match(new RegExp(`--${name}:\s*([^;]+);`))[1].trim();
    const ref = m.match(/^var\(--([\w-]+)\)$/);
    return ref ? resolve(ref[1]) : m;
  };
  const c = (name) => resolve(name).match(/#[0-9A-Fa-f]{6}/)[0];
  assert.ok(ratio(c("color-marker-text"), c("color-marker-bg")) >= 4.5);
  assert.ok(ratio(c("color-marker-selected-text"), c("color-marker-selected-bg")) >= 4.5);
  assert.ok(ratio(c("color-marker-border"), c("color-map-bg")) >= 3);
  assert.ok(ratio(c("color-marker-border"), c("color-marker-bg")) >= 3);
  assert.ok(ratio(c("color-border-control"), c("color-map-bg")) >= 3);
  assert.ok(ratio(c("color-text"), c("color-map-bg")) >= 4.5);
});
