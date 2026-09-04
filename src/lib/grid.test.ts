import { describe, expect, it } from "vitest";

import type { Character, EventItem, Place } from "./types";

import { buildGrid, laneEventCounts } from "./grid";

function place(id: number, name: string): Place {
  return { id: String(id), name, color: "#000", order: id * 10, path: null };
}
function character(id: number, name: string): Character {
  return { id: String(id), name, color: "#000", order: id * 10, path: null };
}
function ev(
  id: number,
  title: string,
  displayTime: string,
  places: Place[],
  characters: Character[],
  eraName: string | null = null,
): EventItem {
  return {
    id: String(id),
    path: `${title}.md`,
    title,
    description: null,
    era:
      eraName === null
        ? null
        : { id: eraName, name: eraName, color: "#000", order: 10, path: null },
    displayTime,
    sortKey: id * 1000,
    color: null,
    places,
    characters,
  };
}

const palace = place(1, "왕궁");
const forest = place(2, "숲");
const eirin = character(1, "에이린");
const kasl = character(2, "카슬");

const ALL_PLACES = new Set(["place-1", "place-2"]);
const ALL_CHARS = new Set(["character-1", "character-2"]);

describe("buildGrid", () => {
  it("사건이 없으면 행도 없다", () => {
    expect(buildGrid([], "place", ALL_PLACES)).toEqual([]);
  });

  it("사건마다 행을 만들고 해당 레인 칸에 넣는다", () => {
    const rows = buildGrid(
      [
        ev(1, "회담", "1년 봄", [palace], [eirin]),
        ev(2, "추격", "2년 여름", [forest], [kasl]),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(2);
    expect(rows[0].displayTime).toBe("1년 봄");
    expect(rows[0].cells.get("place-1")?.[0].title).toBe("회담");
    expect(rows[0].cells.has("place-2")).toBe(false);
    expect(rows[1].cells.get("place-2")?.[0].title).toBe("추격");
  });

  it("작중 시각이 같으면 한 행에 묶어 가로로 나란히 놓는다", () => {
    // 동시간대 병렬 사건: 서로 다른 공간에서 같은 시각에 벌어진 일
    const rows = buildGrid(
      [
        ev(1, "왕궁의 밤", "1년 봄", [palace], [eirin]),
        ev(2, "숲의 추격", "1년 봄", [forest], [kasl]),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].cells.get("place-1")?.[0].title).toBe("왕궁의 밤");
    expect(rows[0].cells.get("place-2")?.[0].title).toBe("숲의 추격");
  });

  it("상위 기간이 다르면 하위 시각이 같아도 다른 행이다", () => {
    // "제3 성력 - 1년"과 "제4 성력 - 1년"을 한 행에 묶으면 안 된다.
    const rows = buildGrid(
      [
        ev(1, "A", "1년", [palace], [eirin], "제3 성력"),
        ev(2, "B", "1년", [forest], [kasl], "제4 성력"),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.displayTime)).toEqual([
      "제3 성력 - 1년",
      "제4 성력 - 1년",
    ]);
  });

  it("상위 기간까지 같으면 한 행으로 묶는다", () => {
    const rows = buildGrid(
      [
        ev(1, "A", "1년", [palace], [eirin], "제3 성력"),
        ev(2, "B", "1년", [forest], [kasl], "제3 성력"),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].displayTime).toBe("제3 성력 - 1년");
  });

  it("상위 기간이 없으면 하위 시각만 라벨로 쓴다", () => {
    const rows = buildGrid(
      [ev(1, "A", "1년 봄", [palace], [eirin])],
      "place",
      ALL_PLACES,
    );

    expect(rows[0].displayTime).toBe("1년 봄");
  });

  it("한쪽만 상위 기간이 있으면 다른 행이다", () => {
    const rows = buildGrid(
      [
        ev(1, "A", "1년", [palace], [eirin], "제3 성력"),
        ev(2, "B", "1년", [forest], [kasl]),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(2);
  });

  it("작중 시각이 같아도 연속되지 않으면 행을 합치지 않는다", () => {
    // 시간순 정렬이 뒤섞이면 안 되므로, 떨어져 있으면 별도 행으로 둔다.
    const rows = buildGrid(
      [
        ev(1, "A", "1년 봄", [palace], [eirin]),
        ev(2, "B", "2년 여름", [forest], [kasl]),
        ev(3, "C", "1년 봄", [palace], [eirin]),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows.map((r) => r.displayTime)).toEqual(["1년 봄", "2년 여름", "1년 봄"]);
  });

  it("여러 공간에 걸친 사건은 각 칸에 모두 놓인다", () => {
    const rows = buildGrid(
      [ev(1, "동시다발", "1년 봄", [palace, forest], [eirin])],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].cells.get("place-1")?.[0].title).toBe("동시다발");
    expect(rows[0].cells.get("place-2")?.[0].title).toBe("동시다발");
  });

  it("인물 축으로도 같은 방식으로 배치된다", () => {
    const rows = buildGrid(
      [ev(1, "회담", "1년 봄", [palace], [eirin, kasl])],
      "character",
      ALL_CHARS,
    );

    expect(rows[0].cells.get("character-1")?.[0].title).toBe("회담");
    expect(rows[0].cells.get("character-2")?.[0].title).toBe("회담");
  });

  it("숨긴 레인의 칸은 채우지 않는다", () => {
    const rows = buildGrid(
      [ev(1, "동시다발", "1년 봄", [palace, forest], [eirin])],
      "place",
      new Set(["place-1"]), // 숲을 숨김
    );

    expect(rows[0].cells.has("place-1")).toBe(true);
    expect(rows[0].cells.has("place-2")).toBe(false);
  });

  it("보이는 레인에 하나도 안 걸린 사건은 행 자체가 생기지 않는다", () => {
    const rows = buildGrid(
      [
        ev(1, "숲에서만", "1년 봄", [forest], [eirin]),
        ev(2, "왕궁에서", "2년 여름", [palace], [eirin]),
      ],
      "place",
      new Set(["place-1"]), // 왕궁만
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].displayTime).toBe("2년 여름");
  });

  it("모든 레인을 숨기면 행이 없다", () => {
    const rows = buildGrid(
      [ev(1, "회담", "1년 봄", [palace], [eirin])],
      "place",
      new Set(),
    );
    expect(rows).toEqual([]);
  });

  it("한 칸에 사건이 여러 개일 수 있다", () => {
    // 같은 시각 같은 공간에서 두 사건
    const rows = buildGrid(
      [
        ev(1, "첫째", "1년 봄", [palace], [eirin]),
        ev(2, "둘째", "1년 봄", [palace], [kasl]),
      ],
      "place",
      ALL_PLACES,
    );

    expect(rows).toHaveLength(1);
    expect(rows[0].cells.get("place-1")?.map((e) => e.title)).toEqual([
      "첫째",
      "둘째",
    ]);
  });
});

describe("laneEventCounts", () => {
  it("레인별 사건 수를 센다", () => {
    const lanes = [
      { id: "place-1", label: "왕궁", color: "#000", path: null },
      { id: "place-2", label: "숲", color: "#000", path: null },
    ];
    const counts = laneEventCounts(
      [
        ev(1, "A", "t", [palace], [eirin]),
        ev(2, "B", "t", [palace, forest], [eirin]),
      ],
      lanes,
      "place",
    );

    expect(counts.get("place-1")).toBe(2);
    expect(counts.get("place-2")).toBe(1);
  });

  it("사건이 없는 레인도 0으로 포함한다", () => {
    const lanes = [{ id: "place-9", label: "빈 공간", color: "#000", path: null }];
    const counts = laneEventCounts([], lanes, "place");
    expect(counts.get("place-9")).toBe(0);
  });
});

describe("buildGrid - 시간 칸 조각", () => {
  it("기간과 시각을 따로 담는다", () => {
    // 격자는 둘을 두 줄로 나눠 보여주므로 합쳐진 형태만으로는 부족하다.
    const rows = buildGrid(
      [ev(1, "함락", "789년", [palace], [], "제3 성력")],
      "place",
      ALL_PLACES,
    );

    expect(rows[0].eraName).toBe("제3 성력");
    expect(rows[0].time).toBe("789년");
    // 합쳐진 형태도 그대로 남는다.
    expect(rows[0].displayTime).toBe("제3 성력 - 789년");
  });

  it("기간이 없으면 eraName은 null이다", () => {
    const rows = buildGrid([ev(1, "함락", "789년", [palace], [])], "place", ALL_PLACES);

    expect(rows[0].eraName).toBeNull();
    expect(rows[0].time).toBe("789년");
  });
});
