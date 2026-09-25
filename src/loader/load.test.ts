import type { App } from "obsidian";
import { beforeEach, describe, expect, it } from "vitest";

// 테스트에서는 껍데기를 직접 집는다. vitest가 "obsidian"을 같은 파일로
// 돌려놓으므로 로더가 만든 Notice와 여기서 보는 것이 같은 것이다.
// ("obsidian"으로 import하면 실제 타입이 잡혀 shown이 없다고 나온다.)
import { Notice, TFile, TFolder } from "../testing/obsidian-stub";
import { loadLoreData } from "./load";

/**
 * 볼트 하나를 통째로 흉내 낸다. 로더가 스캔·설정·해소를 거쳐 뱉는 것이
 * 무엇인지 보려면 세 조각이 다 있어야 한다.
 */
function makeApp(options: {
  folders?: string[];
  notes?: Record<string, { frontmatter: unknown; content?: string }>;
  files?: Record<string, string>;
}): App {
  const notes = options.notes ?? {};
  const files = options.files ?? {};
  const folders = new Set(options.folders ?? []);

  const asFile = (path: string): TFile => {
    const file = new TFile();
    file.path = path;
    file.basename = path.split("/").at(-1)!.replace(/\.md$/, "");
    file.stat = { mtime: 1, ctime: 1, size: 0 };
    return file;
  };

  return {
    vault: {
      getMarkdownFiles: () => Object.keys(notes).map(asFile),
      cachedRead: async (file: TFile) => notes[file.path]?.content ?? "",
      getAbstractFileByPath: (path: string) => {
        if (folders.has(path)) {
          const folder = new TFolder();
          folder.path = path;
          return folder;
        }
        if (path in files) return asFile(path);
        return null;
      },
    },
    metadataCache: {
      getFileCache: (file: TFile) => ({ frontmatter: notes[file.path]?.frontmatter }),
    },
  } as unknown as App;
}

const EVENT = { loreline: "event", displayTime: "1년", sortKey: 1000 };

beforeEach(() => {
  Notice.reset();
});

describe("loadLoreData - 세계 폴더 확인", () => {
  it("폴더가 없으면 알린다", async () => {
    // 탭이 기억하던 폴더가 이름이 바뀌었으면 "사건 노트가 없다"가 뜬다. 노트를
    // 아직 안 만든 것과는 아주 다른 상황이다.
    const app = makeApp({ folders: ["세계"] });

    const data = await loadLoreData(app, {
      folder: "세게",
      configPath: "없다.json",
      notify: false,
    });

    expect(data.warnings.some((w) => w.includes("세게"))).toBe(true);
  });

  it("폴더가 있으면 그 얘기는 하지 않는다", async () => {
    const app = makeApp({ folders: ["세계"] });

    const data = await loadLoreData(app, {
      folder: "세계",
      configPath: "없다.json",
      notify: false,
    });

    expect(data.warnings).toEqual([]);
  });

  it("폴더를 비워 두면 확인할 것도 없다", async () => {
    const app = makeApp({});
    const data = await loadLoreData(app, { folder: "", configPath: "x.json", notify: false });
    expect(data.warnings).toEqual([]);
  });
});

describe("loadLoreData - 경고 합치기", () => {
  it("스캔·설정·해소에서 나온 것을 한 줄기로 모은다", async () => {
    const app = makeApp({
      folders: ["세계"],
      notes: {
        "세계/이상.md": { frontmatter: { loreline: "timeline" } },
        "세계/a.md": { frontmatter: EVENT },
        "세계/b.md": { frontmatter: EVENT },
        "세계/왕도.md": { frontmatter: { loreline: "place" } },
      },
      files: { "세계/loreline.config.json": "" },
    });

    const data = await loadLoreData(app, {
      folder: "세계",
      configPath: "세계/loreline.config.json",
      notify: false,
    });

    const joined = data.warnings.join("\n");
    // 설정 파일이 빈 문자열이라 JSON으로 못 읽는다.
    expect(joined).toContain("JSON 오류");
    // 모르는 loreline 값 (스캔)
    expect(joined).toContain("timeline");
    // 같은 정렬값을 두 사건이 쓴다 (해소)
    expect(joined).toContain("정렬값 1000");
  });

  it("정의 파일이 없으면 그것만으로는 경고하지 않는다", async () => {
    // 색과 순서를 아직 안 정했을 뿐이다.
    const app = makeApp({ folders: ["세계"], notes: { "세계/a.md": { frontmatter: EVENT } } });

    const data = await loadLoreData(app, {
      folder: "세계",
      configPath: "세계/loreline.config.json",
      notify: false,
    });

    expect(data.warnings).toEqual([]);
    expect(data.events).toHaveLength(1);
  });
});

describe("loadLoreData - 알림", () => {
  const noisy = () =>
    makeApp({
      folders: ["세계"],
      notes: Object.fromEntries(
        Array.from({ length: 8 }, (_, i) => [
          `세계/${i}.md`,
          { frontmatter: { loreline: "event", displayTime: "1년" } },
        ]),
      ),
    });

  it("notify가 꺼져 있으면 아무것도 띄우지 않는다", async () => {
    await loadLoreData(noisy(), { folder: "세계", configPath: "x.json", notify: false });
    expect(Notice.shown).toEqual([]);
  });

  it("많으면 앞의 몇 건만 띄우고 나머지는 개수로 알린다", async () => {
    await loadLoreData(noisy(), { folder: "세계", configPath: "x.json", notify: true });

    // sortKey를 안 적은 사건이 8건 → 5건 + "3건 더 있다"
    expect(Notice.shown).toHaveLength(6);
    expect(Notice.shown.at(-1)).toContain("3건 더 있다");
  });
});
