import { TFile, type Vault } from "obsidian";

/**
 * `loreline.config.json` 로드·검증.
 *
 * 색과 순서만 담은 정의 파일이다. 옵시디언 YAML 파서가 중첩 배열에서 불안정해
 * frontmatter 대신 JSON을 쓴다.
 */

/** 정의 파일의 항목 하나 */
export type ConfigEntry = {
  name: string;
  color?: string;
  order?: number;
};

export type LoreConfig = {
  characters: ConfigEntry[];
  places: ConfigEntry[];
  eras: ConfigEntry[];
};

export const EMPTY_CONFIG: LoreConfig = {
  characters: [],
  places: [],
  eras: [],
};

/** 정의 파일에 색이 없는 항목이 쓸 기본색 */
export const DEFAULT_COLOR = "#6b7280";

/**
 * 정의 파일이 없거나 깨졌을 때도 뷰는 떠야 한다. 그래서 실패를 예외로 던지지
 * 않고 빈 설정 + 경고 목록으로 돌려준다.
 */
export type ConfigLoadResult = {
  config: LoreConfig;
  warnings: string[];
};

/** 알 수 없는 모양이 들어와도 배열 하나만 건져낸다. */
function normalizeSection(raw: unknown, section: string, warnings: string[]): ConfigEntry[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    warnings.push(`정의 파일의 "${section}"이 배열이 아니라 무시했다.`);
    return [];
  }

  const entries: ConfigEntry[] = [];
  for (const item of raw) {
    if (typeof item !== "object" || item === null) {
      warnings.push(`정의 파일의 "${section}"에 객체가 아닌 항목이 있어 무시했다.`);
      continue;
    }
    const record = item as Record<string, unknown>;
    const name = typeof record.name === "string" ? record.name.trim() : "";
    if (!name) {
      warnings.push(`정의 파일의 "${section}"에 name이 없는 항목이 있어 무시했다.`);
      continue;
    }
    entries.push({
      name,
      color: typeof record.color === "string" ? record.color : undefined,
      order: typeof record.order === "number" ? record.order : undefined,
    });
  }
  return entries;
}

/** JSON 문자열 → 검증된 설정. 파싱만 하므로 단위 테스트 대상이다. */
export function parseConfig(text: string): ConfigLoadResult {
  const warnings: string[] = [];

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      config: EMPTY_CONFIG,
      warnings: [`정의 파일을 읽지 못했다 (JSON 오류): ${message}`],
    };
  }

  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return { config: EMPTY_CONFIG, warnings: ["정의 파일의 최상위가 객체가 아니다."] };
  }

  const record = raw as Record<string, unknown>;
  return {
    config: {
      characters: normalizeSection(record.characters, "characters", warnings),
      places: normalizeSection(record.places, "places", warnings),
      eras: normalizeSection(record.eras, "eras", warnings),
    },
    warnings,
  };
}

/**
 * 볼트에서 정의 파일을 읽는다. 파일이 없으면 빈 설정으로 진행한다
 * (색·순서를 아직 안 정했을 뿐, 사건은 보여야 한다).
 */
export async function loadConfig(vault: Vault, path: string): Promise<ConfigLoadResult> {
  // getFileByPath는 비교적 최근에 생겼다. 오래된 쪽을 써서 minAppVersion을
  // 낮게 유지한다.
  const file = vault.getAbstractFileByPath(path);
  if (!(file instanceof TFile)) return { config: EMPTY_CONFIG, warnings: [] };

  try {
    return parseConfig(await vault.cachedRead(file));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { config: EMPTY_CONFIG, warnings: [`정의 파일을 열지 못했다: ${message}`] };
  }
}
