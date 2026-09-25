import { describe, expect, it } from "vitest";

import type { Character, EventItem, Place } from "./types";

import { buildGrid } from "./grid";
import { laneLifespans, layoutRow } from "./grid-layout";

// 원본 테스트를 그대로 옮기고 팩토리만 플러그인 타입에 맞췄다.
function character(id: number, name: string): Character {
  return { id: String(id), name, color: "#000", order: id * 10, path: null };
}

function ev(
  id: number,
  title: string,
  displayTime: string,
  characters: Character[],
): EventItem {
  return {
    id: String(id),
    path: `${title}.md`,
    title,
    description: null,
    era: null,
    displayTime,
    sortKey: id * 1000,
    places: [] as Place[],
    characters,
  };
}

const 베르크 = character(1, "베르크");
const 어부 = character(2, "어부");
const 린다 = character(3, "린다");
/** 왼쪽부터 베르크 - 어부 - 린다 */
const laneIds = ["character-1", "character-2", "character-3"];

function rowsOf(events: EventItem[]) {
  return buildGrid(events, "character", new Set(laneIds));
}

describe("layoutRow", () => {
  it("한 인물만 나오는 사건은 그 열 하나만 차지한다", () => {
    const rows = rowsOf([ev(1, "혼자", "어느 날", [베르크])]);
    const { placements, trackCount } = layoutRow(rows[0], laneIds);

    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({
      startLane: 0,
      endLane: 0,
      laneIndexes: [0],
      track: 0,
    });
    expect(trackCount).toBe(1);
  });

  it("여러 인물에 걸친 사건은 한 장으로 양끝을 잇는다", () => {
    const rows = rowsOf([ev(1, "기어코, 그 날", "어느 날", [베르크, 린다])]);
    const { placements } = layoutRow(rows[0], laneIds);

    // 복제되지 않고 하나다.
    expect(placements).toHaveLength(1);
    expect(placements[0]).toMatchObject({ startLane: 0, endLane: 2 });
  });

  it("가운데 낀 열은 구간에는 들어가도 참여 목록에는 없다", () => {
    const rows = rowsOf([ev(1, "둘만의 일", "어느 날", [베르크, 린다])]);
    const { placements } = layoutRow(rows[0], laneIds);

    expect(placements[0].startLane).toBe(0);
    expect(placements[0].endLane).toBe(2);
    // 어부(1번 열)는 빠져 있어야 한다. 카드 띠를 여기에만 찍는다.
    expect(placements[0].laneIndexes).toEqual([0, 2]);
  });

  it("가로로 겹치면 아래 단으로 내린다", () => {
    const rows = rowsOf([
      ev(1, "가로지르는 사건", "같은 시각", [베르크, 린다]),
      ev(2, "어부의 사건", "같은 시각", [어부]),
    ]);
    const { placements, trackCount } = layoutRow(rows[0], laneIds);

    expect(trackCount).toBe(2);
    expect(placements[0]).toMatchObject({ track: 0, startLane: 0, endLane: 2 });
    expect(placements[1]).toMatchObject({ track: 1, startLane: 1, endLane: 1 });
  });

  it("겹치지 않으면 같은 단에 나란히 둔다", () => {
    const rows = rowsOf([
      ev(1, "베르크의 일", "같은 시각", [베르크]),
      ev(2, "린다의 일", "같은 시각", [린다]),
    ]);
    const { placements, trackCount } = layoutRow(rows[0], laneIds);

    expect(trackCount).toBe(1);
    expect(placements.map((p) => p.track)).toEqual([0, 0]);
  });

  it("아래 단에 빈자리가 있으면 새 단을 만들지 않고 채운다", () => {
    const rows = rowsOf([
      ev(1, "전체", "같은 시각", [베르크, 어부, 린다]),
      ev(2, "왼쪽 둘", "같은 시각", [베르크, 어부]),
      ev(3, "오른쪽 하나", "같은 시각", [린다]),
    ]);
    const { placements, trackCount } = layoutRow(rows[0], laneIds);

    // 3번은 2번(0~1열)과 겹치지 않으므로 같은 단 오른쪽에 들어간다.
    expect(placements.map((p) => p.track)).toEqual([0, 1, 1]);
    expect(trackCount).toBe(2);
  });

  it("숨긴 레인은 구간 계산에서 빠져 양옆이 이웃이 된다", () => {
    const rows = buildGrid(
      [ev(1, "둘만의 일", "어느 날", [베르크, 린다])],
      "character",
      new Set(["character-1", "character-3"]),
    );
    const { placements } = layoutRow(rows[0], ["character-1", "character-3"]);

    expect(placements[0]).toMatchObject({ startLane: 0, endLane: 1 });
  });

  it("사건이 없는 행은 단이 하나로 남는다", () => {
    const rows = rowsOf([ev(1, "혼자", "어느 날", [베르크])]);
    // 레인 목록에 없는 열만 넘기면 놓일 자리가 없다.
    const { placements, trackCount } = layoutRow(rows[0], ["character-9"]);

    expect(placements).toHaveLength(0);
    expect(trackCount).toBe(1);
  });
});

describe("laneLifespans", () => {
  it("첫 등장 행과 마지막 등장 행을 찾는다", () => {
    const rows = rowsOf([
      ev(1, "첫 일", "1년", [베르크]),
      ev(2, "둘째 일", "2년", [린다]),
      ev(3, "셋째 일", "3년", [베르크]),
    ]);
    const spans = laneLifespans(rows, laneIds);

    expect(spans.get("character-1")).toEqual({ first: 0, last: 2 });
    expect(spans.get("character-3")).toEqual({ first: 1, last: 1 });
  });

  it("한 번도 안 나오는 레인은 없다", () => {
    const rows = rowsOf([ev(1, "첫 일", "1년", [베르크])]);
    const spans = laneLifespans(rows, laneIds);

    expect(spans.has("character-2")).toBe(false);
  });

  it("중간에 비는 행이 있어도 첫·마지막만 본다", () => {
    const rows = rowsOf([
      ev(1, "첫 일", "1년", [베르크]),
      ev(2, "남의 일", "2년", [린다]),
      ev(3, "셋째 일", "3년", [베르크]),
    ]);
    const spans = laneLifespans(rows, laneIds);

    // 2년 행에는 베르크가 없지만 선은 이어져야 한다.
    expect(spans.get("character-1")).toEqual({ first: 0, last: 2 });
  });
});
