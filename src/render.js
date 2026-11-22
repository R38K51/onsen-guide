// DOM を作る。textContent と createElement だけを使う（HTML 文字列の代入は使わない）。
import { t } from "./i18n.js";

// data-i18n を持つ要素の文字を、いまの言語の辞書で置き換える
export function applyStaticText(root = document) {
  for (const el of root.querySelectorAll("[data-i18n]")) {
    el.textContent = t(el.dataset.i18n);
  }
}

export function markLanguage(lang, root = document) {
  for (const button of root.querySelectorAll("button[data-lang]")) {
    button.setAttribute("aria-pressed", String(button.dataset.lang === lang));
  }
}
