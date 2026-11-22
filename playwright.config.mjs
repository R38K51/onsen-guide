import { defineConfig } from "@playwright/test";

const PORT = 8741;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "*.spec.mjs",
  fullyParallel: true,
  reporter: [["list"]],
  use: { baseURL: `http://127.0.0.1:${PORT}` },
  // 静的ファイルを配るだけ。テストが終わると Playwright が止める
  webServer: {
    command: `node e2e/server.mjs ${PORT}`,
    url: `http://127.0.0.1:${PORT}/index.html`,
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
