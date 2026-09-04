import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import { TFile, TFolder } from "../testing/obsidian-stub";
import { parseConfig } from "./config";
import {
  buildStarterConfig,
  createWorld,
  normalizeFolderPath,
  starterNotes,
  WORLD_FOLDER_NAMES,
} from "./create-world";

/** 만들기가 실제로 무엇을 썼는지 보려고 쓴 것을 그대로 들고 있는다. */
class FakeVault {
  created = new Map<string, string>();
  folders = new Set<string>();
  /** 경로 → frontmatter. 이미 있던 노트를 흉내 낼 때 쓴다. */
  notes = new Map<string, unknown>();
  files = new Set<string>();

  /** 폴더를 만들라는 요청이 온 순서 */
  folderCalls: string[] = [];

  withFolder(...paths: string[]): this {
    for (const path of paths) this.folders.add(path);
    return this;
  }

  withFile(path: string): this {
    this.files.add(path);
    return this;
  }

  withNote(path: string, frontmatter: unknown): this {
    this.notes.set(path, frontmatter);
    return this;
  }

  asApp(vaultName = "볼트"): App {
    const vault = this;
    return {
      vault: {
        getName: () => vaultName,
        getMarkdownFiles: () =>
          [...vault.notes.keys()].map((path) => {
            const file = new TFile();
            file.path = path;
            return file;
          }),
        getAbstractFileByPath(path: string) {
          if (vault.folders.has(path)) {
            const folder = new TFolder();
            folder.path = path;
            return folder;
          }
          if (vault.files.has(path) || vault.notes.has(path) || vault.created.has(path)) {
            const file = new TFile();
            file.path = path;
            return file;
          }
          return null;
        },
        async createFolder(path: string) {
          vault.folderCalls.push(path);
          vault.folders.add(path);
        },
        async create(path: string, data: string) {
          vault.created.set(path, data);
        },
      },
      metadataCache: {
        getFileCache: (file: TFile) => ({ frontmatter: vault.notes.get(file.path) }),
      },
    } as unknown as App;
  }
}

describe("normalizeFolderPath", () => {
  it("앞뒤 공백과 슬래시를 벗긴다", () => {
    expect(normalizeFolderPath("  /핀타디네/  ")).toBe("핀타디네");
  });

  it("역슬래시로 적어도 받아 준다", () => {
    // 윈도우 탐색기에서 경로를 복사해 붙이는 일이 흔하다.
    expect(normalizeFolderPath("작품\\1부")).toBe("작품/1부");
  });

  it("겹친 슬래시를 하나로 만든다", () => {
    expect(normalizeFolderPath("작품//1부")).toBe("작품/1부");
  });

  it("볼트 밖으로 나가는 조각은 버린다", () => {
    expect(normalizeFolderPath("../../바깥/핀타디네")).toBe("바깥/핀타디네");
    expect(normalizeFolderPath("./핀타디네")).toBe("핀타디네");
  });

  it("빈 경로는 빈 채로 둔다", () => {
    expect(normalizeFolderPath("   ")).toBe("");
    expect(normalizeFolderPath("///")).toBe("");
  });
});

describe("buildStarterConfig", () => {
  it("이름과 빈 구획 셋을 담는다", () => {
    const { config, warnings } = parseConfig(buildStarterConfig("핀타디네"));

    expect(warnings).toEqual([]);
    expect(config.name).toBe("핀타디네");
    expect(config.characters).toEqual([]);
    expect(config.places).toEqual([]);
    expect(config.eras).toEqual([]);
  });

  it("예제 노트의 이름을 미리 넣지 않는다", () => {
    // 예제를 지웠을 때 "정의 파일엔 있는데 노트가 없다"가 뜨면 첫인상이 나쁘다.
    expect(buildStarterConfig("가")).not.toContain("예시");
  });

  it("사람이 열어 고칠 파일이라 줄바꿈으로 끝난다", () => {
    expect(buildStarterConfig("가").endsWith("\n")).toBe(true);
  });
});

describe("starterNotes", () => {
  const notes = starterNotes("새 작품");

  it("종류마다 한 장씩 제 폴더에 놓는다", () => {
    expect(notes.map((note) => note.path)).toEqual([
      "새 작품/사건/예시 사건.md",
      "새 작품/인물/예시 인물.md",
      "새 작품/장소/예시 장소.md",
      "새 작품/기간/예시 기간.md",
    ]);
  });

  it("네 장의 loreline 값이 폴더와 맞는다", () => {
    const kinds = notes.map((note) => note.content.match(/loreline: (\w+)/)?.[1]);
    expect(kinds).toEqual(["event", "character", "place", "era"]);
  });

  it("예시 사건이 나머지 셋을 이름으로 가리킨다", () => {
    // 만들자마자 타임라인에 사건 하나가 실제로 서 있어야 한다.
    const event = notes[0].content;
    expect(event).toContain('era: "예시 기간"');
    expect(event).toContain('characters: ["예시 인물"]');
    expect(event).toContain('places: ["예시 장소"]');
  });

  it("예시 사건에 정렬값과 작중 시각이 들어 있다", () => {
    expect(notes[0].content).toContain("sortKey: 1000");
    expect(notes[0].content).toContain('displayTime: "1년 봄"');
  });
});

describe("createWorld", () => {
  it("정의 파일과 폴더 넷, 예제 넷을 놓는다", async () => {
    const vault = new FakeVault();

    const result = await createWorld(vault.asApp(), { folder: "새 작품" });

    expect(result.world).toEqual({
      folder: "새 작품",
      configPath: "새 작품/loreline.config.json",
      name: "새 작품",
    });
    expect(vault.folderCalls).toEqual([
      "새 작품",
      ...WORLD_FOLDER_NAMES.map((name) => `새 작품/${name}`),
    ]);
    expect(result.createdNotes).toHaveLength(4);
    expect(vault.created.has("새 작품/사건/예시 사건.md")).toBe(true);
  });

  it("있는 폴더는 다시 만들지 않는다", async () => {
    const vault = new FakeVault().withFolder("핀타디네", "핀타디네/사건");

    const result = await createWorld(vault.asApp(), { folder: "핀타디네" });

    expect(vault.folderCalls).toEqual([
      "핀타디네/인물",
      "핀타디네/장소",
      "핀타디네/기간",
    ]);
    expect(result.createdFolders).toEqual([
      "핀타디네/인물",
      "핀타디네/장소",
      "핀타디네/기간",
    ]);
  });

  it("loreline 노트가 이미 있는 폴더에는 예제를 넣지 않는다", async () => {
    // 노트를 먼저 써 두고 나중에 세계로 선언하는 경우다. 형식은 이미 안다.
    const vault = new FakeVault()
      .withFolder("상실의 유산")
      .withNote("상실의 유산/등장인물/레오나.md", { loreline: "character" });

    const result = await createWorld(vault.asApp(), { folder: "상실의 유산" });

    expect(result.createdNotes).toEqual([]);
    expect(vault.created.size).toBe(1); // 정의 파일 하나뿐
  });

  it("loreline과 무관한 노트만 있으면 예제를 넣는다", async () => {
    const vault = new FakeVault()
      .withFolder("새 작품")
      .withNote("새 작품/메모.md", { tags: ["아무거나"] });

    const result = await createWorld(vault.asApp(), { folder: "새 작품" });

    expect(result.createdNotes).toHaveLength(4);
  });

  it("예제 자리에 파일이 이미 있으면 건너뛴다", async () => {
    const vault = new FakeVault().withFile("새 작품/사건/예시 사건.md");

    const result = await createWorld(vault.asApp(), { folder: "새 작품" });

    expect(result.createdNotes).not.toContain("새 작품/사건/예시 사건.md");
    expect(result.createdNotes).toHaveLength(3);
    expect(vault.created.has("새 작품/사건/예시 사건.md")).toBe(false);
  });

  it("이름을 주면 그것을 쓴다", async () => {
    const vault = new FakeVault().withFolder("핀타디네");

    const { world } = await createWorld(vault.asApp(), {
      folder: "핀타디네",
      name: "  핀타디네 데랑 이야기  ",
    });

    expect(world.name).toBe("핀타디네 데랑 이야기");
    expect(parseConfig(vault.created.get(world.configPath)!).config.name).toBe(
      "핀타디네 데랑 이야기",
    );
  });

  it("이름을 비우면 폴더명을 쓴다", async () => {
    const vault = new FakeVault();

    const { world } = await createWorld(vault.asApp(), { folder: "작품/1부", name: "   " });

    expect(world.name).toBe("1부");
  });

  it("경로를 다듬어 쓴다", async () => {
    const vault = new FakeVault();

    const { world } = await createWorld(vault.asApp(), { folder: "/핀타디네/" });

    expect(world.folder).toBe("핀타디네");
  });

  it("이미 세계인 폴더는 건드리지 않는다", async () => {
    // 덮어쓰면 그 세계의 색과 순서가 통째로 날아간다.
    const vault = new FakeVault()
      .withFolder("핀타디네")
      .withFile("핀타디네/loreline.config.json");

    await expect(createWorld(vault.asApp(), { folder: "핀타디네" })).rejects.toThrow(
      "이미 세계다",
    );
    expect(vault.created.size).toBe(0);
    expect(vault.folderCalls).toEqual([]);
  });

  it("폴더 자리에 파일이 있으면 거절한다", async () => {
    const vault = new FakeVault().withFile("핀타디네");

    await expect(createWorld(vault.asApp(), { folder: "핀타디네" })).rejects.toThrow(
      "폴더가 아니라 파일",
    );
    expect(vault.created.size).toBe(0);
    expect(vault.folderCalls).toEqual([]);
  });

  it("폴더를 안 적으면 거절한다", async () => {
    // 빈 경로는 볼트 전체를 뜻한다. 실수로 만들 자리가 아니다.
    const vault = new FakeVault();

    await expect(createWorld(vault.asApp(), { folder: "  " })).rejects.toThrow("폴더를 적어야");
    expect(vault.created.size).toBe(0);
  });
});
