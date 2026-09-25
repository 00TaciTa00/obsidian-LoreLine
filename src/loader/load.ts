import { Notice, TFolder, type App } from "obsidian";

import type { LoreData } from "../lib/types";
import { loadConfig } from "./config";
import { buildLoreData } from "./resolve";
import { scanVault, type ScanCache } from "./scan";

/** 로더 한 바퀴에 필요한 경로들 */
export type LoadOptions = {
  /** 스캔 대상 폴더. 빈 문자열이면 볼트 전체 */
  folder: string;
  /** 정의 파일의 볼트 경로 */
  configPath: string;
  /** 경고를 Notice로도 띄울지 */
  notify: boolean;
  /** 지난번에 읽은 것. 바뀐 노트만 다시 읽으려고 넘긴다. */
  cache?: ScanCache;
};

/** 한 번에 너무 많은 Notice가 뜨지 않게 자른다. */
const MAX_NOTICES = 5;

/**
 * 세계 폴더가 아직 있는지.
 *
 * 탭은 보던 세계를 workspace.json에 들고 있다가 재시작 뒤 그대로 연다. 그 사이
 * 폴더 이름을 바꾸거나 지웠으면 아무것도 안 걸려 "사건 노트가 없다"가 뜬다.
 * 노트를 아직 안 만든 것과는 아주 다른 상황이라 갈라서 알린다.
 */
function checkFolder(app: App, folder: string): string[] {
  if (!folder) return [];
  const target = app.vault.getAbstractFileByPath(folder);
  if (target instanceof TFolder) return [];
  return [
    `세계 폴더 "${folder}"를 찾지 못했다. 이름을 바꾸거나 지웠다면 툴바의 세계 이름을 눌러 다시 고르라.`,
  ];
}

/**
 * 스캔 → 설정 로드 → 해소를 한 번에 돌린다.
 *
 * 경고는 뷰를 막지 않는다. 색을 깜빡했거나 이름을 잘못 적었어도 나머지는
 * 보여야 하기 때문이다. 모아서 LoreData에 실어 보내고, 뷰가 그것을 띄운다.
 */
export async function loadLoreData(app: App, options: LoadOptions): Promise<LoreData> {
  const folderWarnings = checkFolder(app, options.folder);
  const scan = await scanVault(app, options.folder, options.cache);
  const { config, warnings: configWarnings } = await loadConfig(app.vault, options.configPath);
  const data = buildLoreData(scan, config);

  // 세 곳에서 나온 경고를 한 줄기로 합친다. 보는 쪽은 어디서 났는지 알 필요가 없다.
  const warnings = [...folderWarnings, ...configWarnings, ...scan.warnings, ...data.warnings];

  if (options.notify) {
    for (const message of warnings.slice(0, MAX_NOTICES)) {
      new Notice(`LoreLine: ${message}`);
    }
    if (warnings.length > MAX_NOTICES) {
      new Notice(`LoreLine: 경고 ${warnings.length - MAX_NOTICES}건 더 있다.`);
    }
  }

  return { ...data, warnings };
}
