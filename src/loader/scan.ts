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
  /** `loreline: era` 노트로 존재가 확인된 기간 이름 */
  eraNames: string[];
  warnings: string[];
};

/** 노트 한 장을 훑어 얻은 것. 파일이 그대로면 다시 만들 이유가 없다. */
type CacheEntry = {
  mtime: number;
  kind: "event" | "character" | "place" | "era";
  /** 확장자를 뺀 파일명. 인물·장소·기간은 이것이 곧 이름이다. */
  name: string;
  /** kind가 event일 때만 있다 */
  event: RawEvent | null;
  /** 이 노트가 만든 경고 */
  warnings: string[];
};

/**
 * 경로 → 지난번에 읽은 것. 플러그인이 들고 있다가 스캔할 때마다 넘긴다.
 *
 * 노트 하나를 고쳤을 뿐인데 볼트 전체의 본문을 다시 읽을 이유는 없다. mtime이
 * 그대로면 지난 결과를 쓰고, 바뀐 파일만 다시 읽는다.
 */
export type ScanCache = Map<string, CacheEntry>;

export function createScanCache(): ScanCache {
  return new Map();
}

/** 한 번에 열어 둘 파일 수. 볼트가 커도 핸들이 한꺼번에 몰리지 않게 한다. */
const READ_BATCH = 32;

/** 폴더 경로 아래에 있는 파일인지. 빈 경로는 볼트 전체를 뜻한다. */
function isInFolder(path: string, folder: string): boolean {
  if (!folder) return true;
  const prefix = folder.endsWith("/") ? folder : `${folder}/`;
  return path.startsWith(prefix);
}

/** frontmatter의 loreline 값이 아는 것인지 */
function toKind(value: unknown): CacheEntry["kind"] | null {
  const kind = toText(value);
  if (kind === "event" || kind === "character" || kind === "place" || kind === "era") {
    return kind;
  }
  return null;
}

/** 본문까지 읽은 뒤 사건 하나를 완성한다. */
function toEvent(
  file: TFile,
  frontmatter: Record<string, unknown>,
  content: string,
): { event: RawEvent | null; warnings: string[] } {
  const warnings: string[] = [];

  const displayTime = toText(frontmatter.displayTime);
  if (!displayTime) {
    return { event: null, warnings: [`${file.path}: displayTime이 없어 건너뛴다.`] };
  }

  const sortKey = toSortKey(frontmatter.sortKey);
  if (sortKey === null) {
    warnings.push(`${file.path}: sortKey가 숫자가 아니라 맨 뒤로 보낸다.`);
  }

  return {
    event: {
      path: file.path,
      title: extractHeading(content) ?? file.basename,
      description: extractDescription(content),
      displayTime,
      // 값이 없으면 맨 뒤. 읽기 전용이라 채번하지 않는다.
      sortKey: sortKey ?? Number.MAX_SAFE_INTEGER,
      eraName: toText(frontmatter.era),
      characterNames: toNameList(frontmatter.characters),
      placeNames: toNameList(frontmatter.places),
      color: toText(frontmatter.color),
    },
    warnings,
  };
}

/** 배치로 끊어 병렬로 읽는다. 순서는 들어온 대로 지킨다. */
async function readAll(app: App, files: TFile[]): Promise<string[]> {
  const contents: string[] = [];
  for (let i = 0; i < files.length; i += READ_BATCH) {
    const batch = files.slice(i, i + READ_BATCH);
    contents.push(...(await Promise.all(batch.map((file) => app.vault.cachedRead(file)))));
  }
  return contents;
}

/**
 * 대상 폴더의 `.md`를 훑어 사건·인물·장소·기간을 모은다.
 *
 * frontmatter는 metadataCache에서 가져온다(옵시디언이 이미 파싱해 둔 것을 다시
 * 파싱할 이유가 없다). 본문은 캐시에 없는 사건 노트만, 그것도 한꺼번에 읽는다.
 */
export async function scanVault(
  app: App,
  folder: string,
  cache: ScanCache = createScanCache(),
): Promise<ScanResult> {
  const files = app.vault
    .getMarkdownFiles()
    .filter((file) => isInFolder(file.path, folder));

  const warnings: string[] = [];
  const seen = new Set<string>();

  /** 캐시가 못 쓰는 것들. 본문을 읽어야 한다. */
  const toRead: { file: TFile; frontmatter: Record<string, unknown> }[] = [];
  /** 결과 순서를 파일 목록 순서로 맞추려고 자리를 먼저 잡아 둔다. */
  const entries: (CacheEntry | null)[] = [];

  for (const file of files) {
    seen.add(file.path);

    const cached = cache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime) {
      entries.push(cached);
      continue;
    }

    const frontmatter = app.metadataCache.getFileCache(file)?.frontmatter;
    if (!frontmatter) {
      entries.push(null);
      continue;
    }

    const kind = toKind(frontmatter.loreline);
    if (!kind) {
      // loreline 키가 아예 없는 노트는 이 플러그인과 무관하다. 값이 있는데
      // 모르는 값일 때만 알린다.
      if (frontmatter.loreline !== undefined) {
        warnings.push(`${file.path}: 알 수 없는 loreline 값 "${toText(frontmatter.loreline)}"`);
      }
      entries.push(null);
      continue;
    }

    if (kind === "event") {
      // 본문(설명·H1)이 필요하다. 목록에 적어 두고 아래에서 한꺼번에 읽는다.
      toRead.push({ file, frontmatter });
      continue;
    }

    const entry: CacheEntry = {
      mtime: file.stat.mtime,
      kind,
      name: file.basename,
      event: null,
      warnings: [],
    };
    cache.set(file.path, entry);
    entries.push(entry);
  }

  const contents = await readAll(
    app,
    toRead.map(({ file }) => file),
  );

  toRead.forEach(({ file, frontmatter }, index) => {
    const { event, warnings: eventWarnings } = toEvent(file, frontmatter, contents[index]);
    const entry: CacheEntry = {
      mtime: file.stat.mtime,
      kind: "event",
      name: file.basename,
      event,
      warnings: eventWarnings,
    };
    cache.set(file.path, entry);
    entries.push(entry);
  });

  // 지워지거나 폴더 밖으로 나간 노트는 캐시에서도 뺀다.
  for (const path of [...cache.keys()]) {
    if (!seen.has(path)) cache.delete(path);
  }

  const result: ScanResult = {
    events: [],
    characterNames: [],
    placeNames: [],
    eraNames: [],
    warnings,
  };

  for (const entry of entries) {
    if (!entry) continue;
    result.warnings.push(...entry.warnings);
    if (entry.kind === "character") result.characterNames.push(entry.name);
    else if (entry.kind === "place") result.placeNames.push(entry.name);
    else if (entry.kind === "era") result.eraNames.push(entry.name);
    else if (entry.event) result.events.push(entry.event);
  }

  return result;
}
