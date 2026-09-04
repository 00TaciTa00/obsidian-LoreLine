import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * 순수 로직(src/lib)만 테스트한다. 옵시디언 API에 기대는 코드는 실행 환경이
 * 없으므로 대상에서 뺀다.
 */
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    name: "unit",
    environment: "node",
    include: ["src/**/*.test.ts"],
    exclude: ["node_modules/**"],
  },
});
