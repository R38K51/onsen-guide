// 画面テスト用の静的ファイルの配信（127.0.0.1 のみ。リポジトリの中のファイルだけ）。
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PORT = Number(process.argv[2] ?? 8741);
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
};

createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url, "http://127.0.0.1").pathname);
    const target = resolve(join(ROOT, normalize(pathname === "/" ? "/index.html" : pathname)));
    const allowed = ["index.html", "favicon.svg", "css", "src", "data", "vendor"].some(
      (p) => target === join(ROOT, p) || target.startsWith(join(ROOT, p) + sep),
    );
    if (!allowed) throw new Error("not allowed");
    const body = await readFile(target);
    res.writeHead(200, { "Content-Type": TYPES[extname(target)] ?? "application/octet-stream" });
    res.end(body);
  } catch {
    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("not found");
  }
}).listen(PORT, "127.0.0.1");
