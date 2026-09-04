import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import { TFile, TFolder } from "../testing/obsidian-stub";
import { buildStarterConfig, createWorld, normalizeFolderPath } from "./create-world";
import { parseConfig } from "./config";

/** 만들기가 실제로 무엇을 썼는지 보려고 쓴 것을 그대로 들고 있는다. */
class FakeVault {
  created = new Map<string, string>();
  folders = new Set<string>();
  files = new Set<string>();

  /** 폴더를 만들라는 요청이 온 순서 */
  folderCalls: string[] = [];

  withFolder(path: string): this {
    this.folders.add(path);
    return this;
  }

  withFile(path: string): this {
    this.files.add(path);
    return this;
  }

  asApp(vaultName = "볼트"): App {
    const vault = this;
    return {
      vault: {
        getName: () => vaultName,
        getAbstractFileByPath(path: string) {
          if (vault.folders.has(path)) {
            const folder = new TFolder();
            folder.path = path;
            return folder;
          }
          if (vault.files.has(path) || vault.created.has(path)) {
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

  it("사람이 열어 고칠 파일이라 줄바꿈으로 끝난다", () => {
    expect(buildStarterConfig("가").endsWith("\n")).toBe(true);
  });
});

describe("createWorld", () => {
  it("폴더에 정의 파일을 놓고 세계를 돌려준다", async () => {
    const vault = new FakeVault().withFolder("핀타디네");

    const world = await createWorld(vault.asApp(), { folder: "핀타디네" });

    expect(world).toEqual({
      folder: "핀타디네",
      configPath: "핀타디네/loreline.config.json",
      name: "핀타디네",
    });
    expect(vault.created.has("핀타디네/loreline.config.json")).toBe(true);
  });

  it("없는 폴더는 만든다", async () => {
    const vault = new FakeVault();

    await createWorld(vault.asApp(), { folder: "새 작품" });

    expect(vault.folderCalls).toEqual(["새 작품"]);
  });

  it("있는 폴더는 다시 만들지 않는다", async () => {
    const vault = new FakeVault().withFolder("핀타디네");

    await createWorld(vault.asApp(), { folder: "핀타디네" });

    expect(vault.folderCalls).toEqual([]);
  });

  it("이름을 주면 그것을 쓴다", async () => {
    const vault = new FakeVault().withFolder("핀타디네");

    const world = await createWorld(vault.asApp(), {
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

    const world = await createWorld(vault.asApp(), { folder: "작품/1부", name: "   " });

    expect(world.name).toBe("1부");
  });

  it("경로를 다듬어 쓴다", async () => {
    const vault = new FakeVault();

    const world = await createWorld(vault.asApp(), { folder: "/핀타디네/" });

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
  });

  it("폴더 자리에 파일이 있으면 거절한다", async () => {
    const vault = new FakeVault().withFile("핀타디네");

    await expect(createWorld(vault.asApp(), { folder: "핀타디네" })).rejects.toThrow(
      "폴더가 아니라 파일",
    );
    expect(vault.created.size).toBe(0);
  });

  it("폴더를 안 적으면 거절한다", async () => {
    // 빈 경로는 볼트 전체를 뜻한다. 실수로 만들 자리가 아니다.
    const vault = new FakeVault();

    await expect(createWorld(vault.asApp(), { folder: "  " })).rejects.toThrow("폴더를 적어야");
    expect(vault.created.size).toBe(0);
  });
});
