import { describe, expect, it } from "vitest";

import { DEFAULT_COLOR, EMPTY_CONFIG, type LoreConfig } from "./config";
import type { RawEvent } from "./parse";
import { buildLoreData } from "./resolve";
import type { EntityNote, ScanResult } from "./scan";

/** 개별 노트 하나. 이름과 경로가 함께 온다. */
function note(name: string): EntityNote {
  return { name, path: `${name}.md` };
}

/** 이름들을 노트 목록으로 */
function notes(...names: string[]): EntityNote[] {
  return names.map(note);
}

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
    characters: [],
    places: [],
    eras: [],
    warnings: [],
    ...partial,
  };
}

const CONFIG: LoreConfig = {
  name: null,
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
      scan({ characters: notes("지벨린", "아나이스") }),
      CONFIG,
    );

    expect(data.characters.map((c) => c.name)).toEqual(["아나이스", "지벨린"]);
  });
});

describe("buildLoreData - 해소", () => {
  it("이름을 색이 붙은 객체로 바꾼다", () => {
    const data = buildLoreData(
      scan({
        characters: notes("아나이스"),
        places: notes("왕도"),
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
      path: "왕도.md",
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
      scan({ characters: notes("아나이스", "이름없는손님") }),
      CONFIG,
    );

    const guest = data.characters.at(-1);
    expect(guest?.name).toBe("이름없는손님");
    expect(guest?.color).toBe(DEFAULT_COLOR);
  });

  it("정의 파일에만 있고 노트가 없는 이름을 경고한다", () => {
    const data = buildLoreData(scan({ characters: notes("아나이스") }), CONFIG);

    // 지벨린은 정의 파일에 있지만 노트가 없다.
    expect(data.warnings.join()).toContain("지벨린");
    expect(data.warnings.join()).not.toContain("아나이스");
    // 경고만 하고 목록에서 빼지는 않는다.
    expect(data.characters.map((c) => c.name)).toContain("지벨린");
  });

  it("그 종류의 노트를 아예 안 쓰면 미아를 따지지 않는다", () => {
    // 인물 노트를 한 장도 안 만든 볼트에서 정의 파일 전체가 경고로 쏟아지면
    // 쓸모가 없다.
    const data = buildLoreData(scan({ places: notes("왕도") }), CONFIG);
    expect(data.warnings.join()).not.toContain("아나이스");
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
      scan({ places: notes("숲", "강가", "왕도") }),
      CONFIG,
    );

    // 왕도만 order가 있으니 맨 앞, 나머지는 이름순.
    expect(data.places.map((p) => p.name)).toEqual(["왕도", "강가", "숲"]);
  });
});

describe("buildLoreData - 기간 노트", () => {
  it("loreline: era 노트로만 있는 기간도 목록에 넣는다", () => {
    const data = buildLoreData(scan({ eras: notes("제4 성력") }), CONFIG);

    // 정의 파일에는 제3 성력만 있다. 노트로 만든 기간도 함께 선다.
    expect(data.eras.map((e) => e.name)).toEqual(["제3 성력", "제4 성력"]);
    expect(data.eras[1].color).toBe(DEFAULT_COLOR);
  });

  it("정의 파일에만 있고 노트가 없는 기간을 경고한다", () => {
    const data = buildLoreData(scan({ eras: notes("제4 성력") }), CONFIG);
    expect(data.warnings.join()).toContain("제3 성력");
  });
});

describe("buildLoreData - 정렬값 진단", () => {
  it("같은 정렬값을 나눠 쓰면 알린다", () => {
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "a.md", sortKey: 1000 }),
          raw({ path: "b.md", sortKey: 1000 }),
          raw({ path: "c.md", sortKey: 2000 }),
        ],
      }),
      EMPTY_CONFIG,
    );

    const warning = data.warnings.find((w) => w.includes("정렬값 1000"));
    expect(warning).toContain("2건");
    expect(warning).toContain("a");
    expect(warning).toContain("b");
    // 혼자 쓰는 값은 알릴 것이 없다.
    expect(data.warnings.join()).not.toContain("정렬값 2000");
  });

  it("정렬값을 안 적은 사건끼리는 겹쳤다고 하지 않는다", () => {
    // 그건 스캔 단계에서 이미 알렸다. 여기서 두 번 세면 시끄럽기만 하다.
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "a.md", sortKey: Number.MAX_SAFE_INTEGER }),
          raw({ path: "b.md", sortKey: Number.MAX_SAFE_INTEGER }),
        ],
      }),
      EMPTY_CONFIG,
    );

    expect(data.warnings.join()).not.toContain("정렬값");
  });
});

describe("buildLoreData - 갈라진 행 진단", () => {
  it("같은 시각이 떨어져 있으면 격자에서 갈린다고 알린다", () => {
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "a.md", displayTime: "1년", sortKey: 1000 }),
          raw({ path: "b.md", displayTime: "2년", sortKey: 2000 }),
          raw({ path: "c.md", displayTime: "1년", sortKey: 3000 }),
        ],
      }),
      EMPTY_CONFIG,
    );

    const warning = data.warnings.find((w) => w.includes("1년"));
    expect(warning).toContain("2개 행");
    // 한 시각당 한 번만 알린다.
    expect(data.warnings.filter((w) => w.includes("1년"))).toHaveLength(1);
  });

  it("잇달아 있으면 알릴 것이 없다", () => {
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "a.md", displayTime: "1년", sortKey: 1000 }),
          raw({ path: "b.md", displayTime: "1년", sortKey: 2000 }),
        ],
      }),
      EMPTY_CONFIG,
    );

    expect(data.warnings.join()).not.toContain("갈린다");
  });

  it("기간이 다르면 같은 하위 시각이라도 갈렸다고 하지 않는다", () => {
    // "제3 성력 - 1년"과 "제4 성력 - 1년"은 원래 다른 행이다.
    const data = buildLoreData(
      scan({
        events: [
          raw({ path: "a.md", displayTime: "1년", eraName: "제3 성력", sortKey: 1000 }),
          raw({ path: "b.md", displayTime: "1년", eraName: "제4 성력", sortKey: 2000 }),
        ],
      }),
      { ...EMPTY_CONFIG, eras: [{ name: "제3 성력" }, { name: "제4 성력" }] },
    );

    expect(data.warnings.join()).not.toContain("갈린다");
  });
});
