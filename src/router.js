// ハッシュのルーター（骨組み）。次の段階で `#/` と `#/about`、クエリ（type、pref、lang）の読み書きを実装する。
export function parseHash(hash) {
  const [path, query = ""] = String(hash).replace(/^#/, "").split("?");
  return { route: path === "/about" ? "about" : "home", params: new URLSearchParams(query) };
}
