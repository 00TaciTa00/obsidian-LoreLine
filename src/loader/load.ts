import { Notice, type App } from "obsidian";

import type { LoreData } from "../lib/types";
import { loadConfig } from "./config";
import { buildLoreData } from "./resolve";
import { scanVault } from "./scan";

/** 로더 한 바퀴에 필요한 경로들 */
export type LoadOptions = {
  /** 스캔 대상 폴더. 빈 문자열이면 볼트 전체 */
  folder: string;
  /** 정의 파일의 볼트 경로 */
  configPath: string;
  /** 불일치·파싱 경고를 Notice로 띄울지 */
  notify: boolean;
};

/** 한 번에 너무 많은 Notice가 뜨지 않게 자른다. */
const MAX_NOTICES = 5;

/**
 * 스캔 → 설정 로드 → 해소를 한 번에 돌린다.
 *
 * 경고는 뷰를 막지 않는다. 색을 깜빡했거나 이름을 잘못 적었어도 나머지는
 * 보여야 하기 때문이다. 대신 Notice 한 줄로 알린다.
 */
export async function loadLoreData(app: App, options: LoadOptions): Promise<LoreData> {
  const scan = await scanVault(app, options.folder);
  const { config, warnings: configWarnings } = await loadConfig(app.vault, options.configPath);
  const data = buildLoreData(scan, config);

  if (options.notify) {
    const messages = [
      ...configWarnings,
      ...scan.warnings,
      // 정의 파일에만 있고 노트가 없는 이름 — 오타나 지운 노트일 수 있다.
      ...data.orphanNames.map(
        (name) => `정의 파일의 "${name}"에 해당하는 노트가 없다.`,
      ),
    ];

    for (const message of messages.slice(0, MAX_NOTICES)) {
      new Notice(`LoreLine: ${message}`);
    }
    if (messages.length > MAX_NOTICES) {
      new Notice(`LoreLine: 경고 ${messages.length - MAX_NOTICES}건 더 있다.`);
    }
  }

  return data;
}
