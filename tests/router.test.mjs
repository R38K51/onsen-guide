import { test } from "node:test";
import assert from "node:assert/strict";
import { buildHash, parseHash } from "../src/router.js";

test("空や #/ は画面A、条件なし", () => {
  for (const hash of ["", "#", "#/", "#/?"]) {
    assert.deepEqual(parseHash(hash), { route: "home", type: null, pref: null, lang: null });
  }
});

test("#/about は画面B", () => {
  assert.equal(parseHash("#/about").route, "about");
  assert.equal(parseHash("#/about?lang=en").lang, "en");
});

test("type、pref、lang を読む", () => {
  assert.deepEqual(parseHash("#/?type=sulfur&pref=hokkaido&lang=en"), {
    route: "home", type: "sulfur", pref: "hokkaido", lang: "en",
  });
});

test("不正な値は無視して初期状態に戻す", () => {
  assert.deepEqual(parseHash("#/?type=gold&pref=atlantis&lang=fr"), { route: "home", type: null, pref: null, lang: null });
  assert.equal(parseHash("#/?type=<script>").type, null);
});

test("知らない道筋は画面A", () => {
  assert.equal(parseHash("#/unknown?type=acid").route, "home");
  assert.equal(parseHash("#/unknown?type=acid").type, "acid");
});

test("書いて読むと元に戻る", () => {
  const state = { route: "home", type: "co2", pref: "akita", lang: "ja" };
  assert.equal(buildHash(state), "#/?type=co2&pref=akita&lang=ja");
  assert.deepEqual(parseHash(buildHash(state)), state);
});

test("条件なしは #/ だけ。画面B には type と pref を付けない", () => {
  assert.equal(buildHash({ route: "home" }), "#/");
  assert.equal(buildHash({ route: "about", type: "acid", pref: "oita", lang: "en" }), "#/about?lang=en");
});
