import type { App, TFile } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

import { createScanCache, scanVault, type ScanCache } from "./scan";

/**
 * 옵시디언 대신 쓰는 최소 볼트.
 *
 * 무엇을 몇 번 읽었는지, 몇 개를 동시에 읽었는지까지 센다. 캐시가 실제로
 * 읽기를 줄이는지, 읽기가 정말 병렬로 나가는지를 보려면 그 수가 필요하다.
 */
class FakeVault {
  private files = new Map<string, { mtime: number; content: string; frontmatter: unknown }>();

  /** 경로별 본문 읽기 횟수 */
  readCounts = new Map<string, number>();
  /** 동시에 진행 중이던 읽기의 최대치 */
  peakConcurrency = 0;
  private inFlight = 0;

  set(path: string, frontmatter: unknown, content = "", mtime = 1): this {
    this.files.set(path, { mtime, content, frontmatter });
    return this;
  }

  touch(path: string, content?: string): this {
    const file = this.files.get(path)!;
    file.mtime += 1;
    if (content !== undefined) file.content = content;
    return this;
  }

  remove(path: string): this {
    this.files.delete(path);
    return this;
  }

  get totalReads(): number {
    return [...this.readCounts.values()].reduce((sum, n) => sum + n, 0);
  }

  asApp(): App {
    const vault = this;
    return {
      vault: {
        getMarkdownFiles(): TFile[] {
          return [...vault.files].map(
            ([path, file]) =>
              ({
                path,
                basename: path.split("/").at(-1)!.replace(/\.md$/, ""),
                stat: { mtime: file.mtime },
              }) as TFile,
          );
        },
        async cachedRead(file: TFile): Promise<string> {
          vault.readCounts.set(file.path, (vault.readCounts.get(file.path) ?? 0) + 1);
          vault.inFlight += 1;
          vault.peakConcurrency = Math.max(vault.peakConcurrency, vault.inFlight);
          // 한 틱 쉬어 다른 읽기가 끼어들 틈을 준다.
          await Promise.resolve();
          vault.inFlight -= 1;
          return vault.files.get(file.path)!.content;
        },
      },
      metadataCache: {
        getFileCache(file: TFile) {
          return { frontmatter: vault.files.get(file.path)?.frontmatter };
        },
      },
    } as unknown as App;
  }
}

const EVENT = { loreline: "event", displayTime: "1년", sortKey: 1000 };

let vault: FakeVault;
let cache: ScanCache;

beforeEach(() => {
  vault = new FakeVault();
  cache = createScanCache();
});

describe("scanVault - 분류", () => {
  it("네 종류를 갈라 담는다", async () => {
    vault
      .set("세계/사건/함락.md", EVENT, "성문이 열렸다.")
      .set("세계/인물/아나이스.md", { loreline: "character" })
      .set("세계/장소/왕도.md", { loreline: "place" })
      .set("세계/기간/제3 성력.md", { loreline: "era" });

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.events.map((e) => e.title)).toEqual(["함락"]);
    expect(result.characterNames).toEqual(["아나이스"]);
    expect(result.placeNames).toEqual(["왕도"]);
    expect(result.eraNames).toEqual(["제3 성력"]);
    expect(result.warnings).toEqual([]);
  });

  it("대상 폴더 밖은 건드리지 않는다", async () => {
    vault.set("세계/함락.md", EVENT).set("다른곳/함락.md", EVENT);

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.events).toHaveLength(1);
    expect(vault.readCounts.has("다른곳/함락.md")).toBe(false);
  });

  it("폴더를 비우면 볼트 전체를 본다", async () => {
    vault.set("a.md", EVENT).set("깊은/곳/b.md", EVENT);
    expect((await scanVault(vault.asApp(), "", cache)).events).toHaveLength(2);
  });

  it("loreline 키가 없는 노트는 조용히 지나간다", async () => {
    vault.set("세계/일기.md", { tags: ["메모"] });

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.warnings).toEqual([]);
    expect(vault.totalReads).toBe(0);
  });

  it("모르는 loreline 값은 알린다", async () => {
    vault.set("세계/이상.md", { loreline: "timeline" });

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("timeline");
  });
});

describe("scanVault - 사건 읽기", () => {
  it("본문에서 제목과 설명을 뽑는다", async () => {
    vault.set("세계/함락.md", EVENT, "# 왕도 함락\n\n성문이 열렸다.");

    const [event] = (await scanVault(vault.asApp(), "세계", cache)).events;

    expect(event.title).toBe("왕도 함락");
    expect(event.description).toBe("성문이 열렸다.");
  });

  it("H1이 없으면 파일명을 제목으로 쓴다", async () => {
    vault.set("세계/왕도 함락.md", EVENT, "성문이 열렸다.");
    expect((await scanVault(vault.asApp(), "세계", cache)).events[0].title).toBe("왕도 함락");
  });

  it("displayTime이 없으면 건너뛰고 알린다", async () => {
    vault.set("세계/함락.md", { loreline: "event", sortKey: 1000 });

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.events).toEqual([]);
    expect(result.warnings[0]).toContain("displayTime");
  });

  it("sortKey가 숫자가 아니면 맨 뒤로 보내고 알린다", async () => {
    vault.set("세계/함락.md", { loreline: "event", displayTime: "1년", sortKey: "셋째" });

    const result = await scanVault(vault.asApp(), "세계", cache);

    expect(result.events[0].sortKey).toBe(Number.MAX_SAFE_INTEGER);
    expect(result.warnings[0]).toContain("sortKey");
  });
});

describe("scanVault - 병렬 읽기", () => {
  it("사건 본문을 한꺼번에 읽는다", async () => {
    for (let i = 0; i < 10; i += 1) vault.set(`세계/${i}.md`, EVENT, `본문 ${i}`);

    await scanVault(vault.asApp(), "세계", cache);

    // 한 장씩 기다렸다면 최대치가 1을 넘지 않는다.
    expect(vault.peakConcurrency).toBeGreaterThan(1);
  });

  it("본문이 뒤섞이지 않는다", async () => {
    for (let i = 0; i < 40; i += 1) vault.set(`세계/${i}.md`, EVENT, `본문 ${i}`);

    const result = await scanVault(vault.asApp(), "세계", cache);

    for (const event of result.events) {
      const index = event.path.replace("세계/", "").replace(".md", "");
      expect(event.description).toBe(`본문 ${index}`);
    }
  });
});

describe("scanVault - 캐시", () => {
  it("두 번째 스캔은 본문을 다시 읽지 않는다", async () => {
    vault.set("세계/a.md", EVENT, "가").set("세계/b.md", EVENT, "나");
    const app = vault.asApp();

    await scanVault(app, "세계", cache);
    expect(vault.totalReads).toBe(2);

    await scanVault(app, "세계", cache);
    expect(vault.totalReads).toBe(2);
  });

  it("바뀐 노트만 다시 읽는다", async () => {
    vault.set("세계/a.md", EVENT, "가").set("세계/b.md", EVENT, "나");
    const app = vault.asApp();

    await scanVault(app, "세계", cache);
    vault.touch("세계/a.md", "고친 가");

    const result = await scanVault(app, "세계", cache);

    expect(vault.readCounts.get("세계/a.md")).toBe(2);
    expect(vault.readCounts.get("세계/b.md")).toBe(1);
    expect(result.events.find((e) => e.path === "세계/a.md")?.description).toBe("고친 가");
  });

  it("지운 노트는 결과에서도 캐시에서도 빠진다", async () => {
    vault.set("세계/a.md", EVENT).set("세계/b.md", EVENT);
    const app = vault.asApp();

    await scanVault(app, "세계", cache);
    vault.remove("세계/b.md");

    const result = await scanVault(app, "세계", cache);

    expect(result.events).toHaveLength(1);
    expect(cache.has("세계/b.md")).toBe(false);
  });

  it("캐시를 안 넘기면 매번 처음부터 읽는다", async () => {
    vault.set("세계/a.md", EVENT);
    const app = vault.asApp();

    await scanVault(app, "세계");
    await scanVault(app, "세계");

    expect(vault.readCounts.get("세계/a.md")).toBe(2);
  });
});
