import type { App, TFile } from "obsidian";

import {
  extractDescription,
  extractHeading,
  toNameList,
  toSortKey,
  toText,
  type RawEvent,
} from "./parse";

/** 볼트 스캔 결과. 아직 색·순서가 붙지 않은 날 것이다. */
export type ScanResult = {
  events: RawEvent[];
  /** `loreline: character` 노트로 존재가 확인된 인물 이름 */
  characterNames: string[];
  /** `loreline: place` 노트로 존재가 확인된 장소 이름 */
  placeNames: string[];
  warnings: string[];
};

/** 폴더 경로 아래에 있는 파일인지. 빈 경로는 볼트 전체를 뜻한다. */
function isInFolder(path: string, folder: string): boolean {
  if (!folder) return true;
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  return path.startsWith(prefix);
}

/** 확장자를 뺀 파일명 */
function baseName(file: TFile): string {
  return file.basename;
}

/**
 * 대상 폴더의 `.md`를 훑어 사건·인물·장소를 모은다.
 *
 * frontmatter는 metadataCache에서 가져온다(옵시디언이 이미 파싱해 둔 것을 다시
 * 파싱할 이유가 없다). 본문은 설명이 필요한 사건 노트만 읽는다.
 */
export async function scanVault(app: App, folder: string): Promise<ScanResult> {
  const events: RawEvent[] = [];
  const characterNames: string[] = [];
  const placeNames: string[] = [];
  const warnings: string[] = [];

  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => isInFolder(file.path, folder));

  for (const file of files) {
    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    const kind = toText(frontmatter?.loreline);
    if (!kind) continue;

    if (kind === "character") {
      characterNames.push(baseName(file));
      continue;
    }
    if (kind === "place") {
      placeNames.push(baseName(file));
      continue;
    }
    if (kind !== "event") {
      warnings.push(`${file.path}: 알 수 없는 loreline 값 "${kind}"`);
      continue;
    }

    const displayTime = toText(frontmatter?.displayTime);
    if (!displayTime) {
      warnings.push(`${file.path}: displayTime이 없어 건너뛴다.`);
      continue;
    }

    const sortKey = toSortKey(frontmatter?.sortKey);
    if (sortKey === null) {
      warnings.push(`${file.path}: sortKey가 숫자가 아니라 맨 뒤로 보낸다.`);
    }

    const content = await app.vault.cachedRead(file);
    events.push({
      path: file.path,
      title: extractHeading(content) ?? baseName(file),
      description: extractDescription(content),
      displayTime,
      // 값이 없으면 맨 뒤. 읽기 전용이라 채번하지 않는다.
      sortKey: sortKey ?? Number.MAX_SAFE_INTEGER,
      eraName: toText(frontmatter?.era),
      characterNames: toNameList(frontmatter?.characters),
      placeNames: toNameList(frontmatter?.places),
      color: toText(frontmatter?.color),
    });
  }

  return { events, characterNames, placeNames, warnings };
}
