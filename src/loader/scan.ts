import type { App, CachedMetadata, TFile } from "obsidian";

import {
  extractDescription,
  extractHeading,
  toNameList,
  toSortKey,
  toText,
  type RawEvent,
} from "./parse";

/** 개별 노트로 존재가 확인된 이름 하나. 경로는 뷰에서 문서로 갈 때 쓴다. */
export type EntityNote = { name: string; path: string };

/** 볼트 스캔 결과. 아직 색·순서가 붙지 않은 날 것이다. */
export type ScanResult = {
  events: RawEvent[];
  /** `loreline: character` 노트들 */
  characters: EntityNote[];
  /** `loreline: place` 노트들 */
  places: EntityNote[];
  /** `loreline: era` 노트들 */
  eras: EntityNote[];
  warnings: string[];
};

/** 노트 한 장을 훑어 얻은 것. 파일이 그대로면 다시 만들 이유가 없다. */
type CacheEntry = {
  mtime: number;
  /**
   * 이 항목을 만들 때 metadataCache가 준 파싱 결과.
   *
   * mtime만으로는 부족하다. 파일이 바뀐 직후 metadataCache가 아직 옛 파싱
   * 결과를 주는 틈에 스캔이 돌면, 옛 frontmatter가 새 mtime을 달고 캐시에
   * 들어간다. 파싱이 끝나도 mtime은 같으니 그대로 적중해 옛 값이 남는다.
   * 옵시디언은 다시 파싱할 때만 새 객체를 만들므로, 같은 객체인지를 함께 본다.
   */
  metadata: CachedMetadata;
  kind: "event" | "character" | "place" | "era";
  /** 확장자를 뺀 파일명. 인물·장소·기간은 이것이 곧 이름이다. */
  name: string;
  /** 볼트 경로. 이름을 눌러 그 문서로 갈 때 쓴다. */
  path: string;
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

/**
 * 폴더별 캐시 보관소.
 *
 * 캐시 하나를 여러 세계가 나눠 쓰면 서로를 잡아먹는다. 스캔 끝에 "이번에 못 본
 * 경로"를 지우기 때문에, 세계 A를 읽으면 B의 것이 통째로 날아가고 번갈아 볼
 * 때마다 적중률이 0이 된다. 그래서 폴더마다 따로 둔다.
 */
export class ScanCaches {
  private caches = new Map<string, ScanCache>();

  /** 그 폴더의 캐시. 없으면 만들어 둔다. */
  for(folder: string): ScanCache {
    const found = this.caches.get(folder);
    if (found) return found;

    const created = createScanCache();
    this.caches.set(folder, created);
    return created;
  }

  /** 그 폴더의 캐시를 버린다. 폴더 이름이 바뀌었을 때처럼 통째로 낡았을 때. */
  forget(folder: string): void {
    this.caches.delete(folder);
  }

  clear(): void {
    this.caches.clear();
  }

  get size(): number {
    return this.caches.size;
  }
}

/** 한 번에 열어 둘 파일 수. 볼트가 커도 핸들이 한꺼번에 몰리지 않게 한다. */
const READ_BATCH = 32;

/**
 * 바뀐 경로 중 하나라도 그 폴더 안에 있는지.
 *
 * 세계 넷을 열어 두고 한 곳의 노트를 고쳤을 뿐인데 넷을 다 훑을 이유가 없다.
 */
export function touchesFolder(paths: Iterable<string>, folder: string): boolean {
  for (const path of paths) {
    if (isInFolder(path, folder)) return true;
  }
  return false;
}

/**
 * 폴더 경로 아래에 있는 파일인지. 빈 경로는 볼트 전체를 뜻한다.
 *
 * 앞뒤 슬래시를 벗기고 본다. 세계의 폴더는 정의 파일 경로에서 잘라 내므로
 * 보통 깨끗하지만, 예전에 저장해 둔 값이 그대로 넘어와도 조용히 빈 화면이
 * 되면 안 된다.
 */
export function isInFolder(path: string, folder: string): boolean {
  const trimmed = folder.replace(/^\/+|\/+$/g, "");
  if (!trimmed) return true;
  return path.startsWith(`${trimmed}/`);
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

  /** 캐시가 못 쓰는 사건 노트들. 본문을 읽어야 한다. */
  const toRead: {
    file: TFile;
    metadata: CachedMetadata;
    frontmatter: Record<string, unknown>;
  }[] = [];
  /**
   * 이번 스캔에서 얻은 항목. 사건 노트 중 본문을 새로 읽은 것은 맨 뒤에 붙으므로
   * 파일 목록 순서와 다를 수 있다. 순서는 buildLoreData가 다시 정한다.
   */
  const entries: (CacheEntry | null)[] = [];

  for (const file of files) {
    seen.add(file.path);

    const metadata = app.metadataCache.getFileCache(file);
    const cached = cache.get(file.path);
    if (cached && cached.mtime === file.stat.mtime && cached.metadata === metadata) {
      entries.push(cached);
      continue;
    }

    const frontmatter = metadata?.frontmatter;
    if (!metadata || !frontmatter) {
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
      toRead.push({ file, metadata, frontmatter });
      continue;
    }

    const entry: CacheEntry = {
      mtime: file.stat.mtime,
      metadata,
      kind,
      name: file.basename,
      path: file.path,
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

  toRead.forEach(({ file, metadata, frontmatter }, index) => {
    const { event, warnings: eventWarnings } = toEvent(file, frontmatter, contents[index]);
    const entry: CacheEntry = {
      mtime: file.stat.mtime,
      metadata,
      kind: "event",
      name: file.basename,
      path: file.path,
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
    characters: [],
    places: [],
    eras: [],
    warnings,
  };

  for (const entry of entries) {
    if (!entry) continue;
    result.warnings.push(...entry.warnings);
    const note = { name: entry.name, path: entry.path };
    if (entry.kind === "character") result.characters.push(note);
    else if (entry.kind === "place") result.places.push(note);
    else if (entry.kind === "era") result.eras.push(note);
    else if (entry.event) result.events.push(entry.event);
  }

  return result;
}
