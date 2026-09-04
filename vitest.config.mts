import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * `obsidian` 모듈은 옵시디언 안에서만 존재한다. 껍데기로 바꿔 끼워, 값으로
 * import하는 코드(렌더러의 Keymap, 로더의 Notice·TFile)까지 테스트할 수 있게
 * 한다. 옵시디언 API를 흉내 내는 것이 아니라 모듈 해석만 뚫어 주는 것이다.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      obsidian: fileURLToPath(new URL("./src/testing/obsidian-stub.ts", import.meta.url)),
    },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
