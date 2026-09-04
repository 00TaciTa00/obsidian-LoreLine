import type { App } from "obsidian";
import { describe, expect, it } from "vitest";

import { TFile } from "../testing/obsidian-stub";
import { findWorlds, sortWorlds, worldFolderOf, worldNameOf, type World } from "./worlds";

/** 정의 파일만 있으면 되므로 볼트도 그만큼만 흉내 낸다. */
function makeApp(files: Record<string, string>, vaultName = "볼트"): App {
  return {
    vault: {
      getName: () => vaultName,
      getFiles: () =>
        Object.keys(files).map((path) => {
          const file = new TFile();
          file.path = path;
          file.name = path.split("/").at(-1)!;
          return file;
        }),
      cachedRead: async (file: TFile) => files[file.path],
    },
  } as unknown as App;
}

function world(name: string, folder: string): World {
  return { name, folder, configPath: folder ? `${folder}/loreline.config.json` : "x.json" };
}

describe("worldFolderOf", () => {
  it("정의 파일이 놓인 폴더가 뿌리다", () => {
    expect(worldFolderOf("핀타디네/loreline.config.json")).toBe("핀타디네");
  });

  it("깊은 곳에 두면 그 자리가 뿌리다", () => {
    expect(worldFolderOf("작품/1부/loreline.config.json")).toBe("작품/1부");
  });

  it("최상위에 두면 폴더가 없다 (볼트 전체)", () => {
    expect(worldFolderOf("loreline.config.json")).toBe("");
  });
});

describe("worldNameOf", () => {
  it("정의 파일에 적은 이름이 가장 앞선다", () => {
    expect(worldNameOf("핀타디네", "핀타디네 데랑 이야기", "볼트")).toBe("핀타디네 데랑 이야기");
  });

  it("이름이 없으면 폴더명을 쓴다", () => {
    expect(worldNameOf("작품/1부", null, "볼트")).toBe("1부");
  });

  it("최상위 세계는 볼트 이름으로 부른다", () => {
    expect(worldNameOf("", null, "Hobby")).toBe("Hobby");
  });
});

describe("sortWorlds", () => {
  it("이름순으로 세운다", () => {
    const sorted = sortWorlds([world("핀타디네", "b"), world("상실의 유산", "a")]);
    expect(sorted.map((w) => w.name)).toEqual(["상실의 유산", "핀타디네"]);
  });

  it("이름이 같으면 경로순으로 고정한다", () => {
    const sorted = sortWorlds([world("같은이름", "b"), world("같은이름", "a")]);
    expect(sorted.map((w) => w.folder)).toEqual(["a", "b"]);
  });

  it("원래 배열을 건드리지 않는다", () => {
    const worlds = [world("나", "b"), world("가", "a")];
    sortWorlds(worlds);
    expect(worlds[0].name).toBe("나");
  });
});

describe("findWorlds", () => {
  it("정의 파일이 놓인 폴더마다 세계 하나", async () => {
    const app = makeApp({
      "핀타디네/loreline.config.json": "{}",
      "상실의 유산/loreline.config.json": "{}",
      "Evernote/메모.md": "정의 파일이 없다",
    });

    const worlds = await findWorlds(app);

    expect(worlds.map((w) => w.folder)).toEqual(["상실의 유산", "핀타디네"]);
    expect(worlds[0].configPath).toBe("상실의 유산/loreline.config.json");
  });

  it("정의 파일의 name을 표시 이름으로 쓴다", async () => {
    const app = makeApp({
      "핀타디네/loreline.config.json": JSON.stringify({ name: "핀타디네 데랑 이야기" }),
    });

    expect((await findWorlds(app))[0].name).toBe("핀타디네 데랑 이야기");
  });

  it("name이 없으면 폴더명으로 부른다", async () => {
    const app = makeApp({ "핀타디네/loreline.config.json": "{}" });
    expect((await findWorlds(app))[0].name).toBe("핀타디네");
  });

  it("정의 파일이 깨져 있어도 세계는 선다", async () => {
    // 색을 못 읽을 뿐이지 폴더가 사라진 것은 아니다.
    const app = makeApp({ "핀타디네/loreline.config.json": "{ 이건 JSON이 아니다" });

    const worlds = await findWorlds(app);

    expect(worlds).toHaveLength(1);
    expect(worlds[0].name).toBe("핀타디네");
  });

  it("이름이 비슷한 다른 파일은 세계로 보지 않는다", async () => {
    const app = makeApp({
      "핀타디네/loreline.config.json.bak": "{}",
      "핀타디네/loreline.config.md": "{}",
    });

    expect(await findWorlds(app)).toEqual([]);
  });

  it("최상위에 두면 볼트 전체가 한 세계다", async () => {
    const app = makeApp({ "loreline.config.json": "{}" }, "Hobby");

    const worlds = await findWorlds(app);

    expect(worlds[0].folder).toBe("");
    expect(worlds[0].name).toBe("Hobby");
  });

  it("하나도 없으면 빈 목록이다", async () => {
    expect(await findWorlds(makeApp({ "메모.md": "" }))).toEqual([]);
  });
});
