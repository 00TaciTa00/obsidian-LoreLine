import { describe, expect, it } from "vitest";

import { DEFAULT_COLOR, EMPTY_CONFIG, type LoreConfig } from "./config";
import type { RawEvent } from "./parse";
import { buildLoreData } from "./resolve";
import type { ScanResult } from "./scan";

function raw(partial: Partial<RawEvent> & { path: string }): RawEvent {
  return {
    title: partial.path.replace(/\.md$/, ""),
    description: null,
    displayTime: "1년",
    sortKey: 1000,
    eraName: null,
    characterNames: [],
    placeNames: [],
    color: null,
    ...partial,
  };
}

function scan(partial: Partial<ScanResult> = {}): ScanResult {
  return {
    events: [],
    characterNames: [],
    placeNames: [],
    warnings: [],
    ...partial,
  };
}

const CONFIG: LoreConfig = {
  characters: [
    { name: "아나이스", color: "#3b82f6", order: 10 },
    { name: "지벨린", color: "#ef4444", order: 20 },
  ],
  places: [{ name: "왕도", color: "#22c55e", order: 10 }],
  eras: [{ name: "제3 성력", color: "#a855f7", order: 10 }],
};

describe("buildLoreData - 정렬", () => {
  it("사건을 sortKey 오름차순으로 놓는다", () => {
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "c.md", sortKey: 3000 }),
          raw({ path: "a.md", sortKey: 1000 }),
          raw({ path: "b.md", sortKey: 2000 }),
        ],
      }),
      EMPTY_CONFIG,
    );

    expect(data.events.map((e) => e.path)).toEqual(["a.md", "b.md", "c.md"]);
  });

  it("sortKey가 같으면 경로순으로 고정한다", () => {
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "b.md", sortKey: 1000 }),
          raw({ path: "a.md", sortKey: 1000 }),
        ],
      }),
      EMPTY_CONFIG,
    );

    expect(data.events.map((e) => e.path)).toEqual(["a.md", "b.md"]);
  });

  it("인물·장소는 정의 파일의 order 순으로 놓는다", () => {
    const data = buildLoreData(
      scan({ characterNames: ["지벨린", "아나이스"] }),
      CONFIG,
    );

    expect(data.characters.map((c) => c.name)).toEqual(["아나이스", "지벨린"]);
  });
});

describe("buildLoreData - 해소", () => {
  it("이름을 색이 붙은 객체로 바꾼다", () => {
    const data = buildLoreData(
      scan({
        characterNames: ["아나이스"],
        placeNames: ["왕도"],
        events: [
          raw({
            path: "함락.md",
            eraName: "제3 성력",
            characterNames: ["아나이스"],
            placeNames: ["왕도"],
          }),
        ],
      }),
      CONFIG,
    );

    const event = data.events[0];
    expect(event.places[0]).toEqual({
      id: "왕도",
      name: "왕도",
      color: "#22c55e",
      order: 10,
    });
    expect(event.characters[0].color).toBe("#3b82f6");
    expect(event.era?.color).toBe("#a855f7");
  });

  it("기간을 안 적은 사건의 era는 null이다", () => {
    const data = buildLoreData(scan({ events: [raw({ path: "a.md" })] }), CONFIG);
    expect(data.events[0].era).toBeNull();
  });
});

describe("buildLoreData - 불일치 규칙", () => {
  it("정의 파일에 없는 인물도 기본색·맨 뒤 순서로 보여준다", () => {
    const data = buildLoreData(
      scan({ characterNames: ["아나이스", "이름없는손님"] }),
      CONFIG,
    );

    const guest = data.characters.at(-1);
    expect(guest?.name).toBe("이름없는손님");
    expect(guest?.color).toBe(DEFAULT_COLOR);
  });

  it("정의 파일에만 있고 노트가 없는 이름을 경고 목록에 올린다", () => {
    const data = buildLoreData(scan({ characterNames: ["아나이스"] }), CONFIG);

    // 지벨린은 정의 파일에 있지만 노트가 없다.
    expect(data.orphanNames).toContain("지벨린");
    expect(data.orphanNames).not.toContain("아나이스");
    // 경고만 하고 목록에서 빼지는 않는다.
    expect(data.characters.map((c) => c.name)).toContain("지벨린");
  });

  it("노트도 정의도 없이 사건만 참조한 이름도 목록에 넣는다", () => {
    // 빼면 그 사건이 격자에서 통째로 사라진다.
    const data = buildLoreData(
      scan({ events: [raw({ path: "a.md", placeNames: ["뒷골목"] })] }),
      EMPTY_CONFIG,
    );

    expect(data.places.map((p) => p.name)).toEqual(["뒷골목"]);
    expect(data.events[0].places).toHaveLength(1);
  });

  it("순서를 안 정한 것끼리는 이름순으로 고정한다", () => {
    const data = buildLoreData(
      scan({ placeNames: ["숲", "강가", "왕도"] }),
      CONFIG,
    );

    // 왕도만 order가 있으니 맨 앞, 나머지는 이름순.
    expect(data.places.map((p) => p.name)).toEqual(["왕도", "강가", "숲"]);
  });
});
