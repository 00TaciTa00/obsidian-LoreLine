import { describe, expect, it } from "vitest";

import type { Era, EventItem } from "./types";

import { NO_ERA_LABEL, buildEraGroups } from "./era-groups";

function era(id: number, name: string, color = "#111", path: string | null = null): Era {
  return { id: String(id), name, color, order: id * 10, path };
}

function ev(
  id: number,
  title: string,
  displayTime: string,
  eraOf: Era | null,
): EventItem {
  return {
    id: String(id),
    path: `${title}.md`,
    title,
    description: null,
    era: eraOf,
    displayTime,
    sortKey: id * 1000,
    color: null,
    places: [],
    characters: [],
  };
}

const third = era(1, "제3 성력");
const fourth = era(2, "제4 성력");

describe("buildEraGroups", () => {
  it("사건이 없어도 만들어 둔 기간은 남는다", () => {
    const groups = buildEraGroups([], [third, fourth]);

    expect(groups.map((g) => g.name)).toEqual(["제3 성력", "제4 성력"]);
    expect(groups.every((g) => g.times.length === 0)).toBe(true);
    expect(groups.every((g) => g.eventCount === 0)).toBe(true);
  });

  it("기간 안에서 하위 시각으로 한 번 더 묶는다", () => {
    const groups = buildEraGroups(
      [
        ev(1, "건국", "1년", third),
        ev(2, "즉위", "1년", third),
        ev(3, "전쟁", "2년", third),
      ],
      [third],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0].eventCount).toBe(3);
    expect(groups[0].times.map((t) => t.displayTime)).toEqual(["1년", "2년"]);
    expect(groups[0].times[0].events.map((e) => e.title)).toEqual([
      "건국",
      "즉위",
    ]);
  });

  it("떨어져 있는 같은 기간도 한 구획으로 모은다", () => {
    // 격자(buildGrid)는 연속한 것만 묶지만 여기서는 기간이 곧 구획이라,
    // 한 기간이 목록에 두 번 나오면 안 된다.
    const groups = buildEraGroups(
      [
        ev(1, "가", "1년", third),
        ev(2, "나", "1년", fourth),
        ev(3, "다", "2년", third),
      ],
      [third, fourth],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0].name).toBe("제3 성력");
    expect(groups[0].eventCount).toBe(2);
    expect(groups[1].eventCount).toBe(1);
  });

  it("떨어져 있는 같은 하위 시각도 한 덩어리로 모은다", () => {
    const groups = buildEraGroups(
      [
        ev(1, "가", "1년", third),
        ev(2, "나", "2년", third),
        ev(3, "다", "1년", third),
      ],
      [third],
    );

    expect(groups[0].times.map((t) => t.displayTime)).toEqual(["1년", "2년"]);
    expect(groups[0].times[0].events.map((e) => e.title)).toEqual(["가", "다"]);
  });

  it("구획 순서는 사건 순서가 아니라 기간 순서를 따른다", () => {
    // 사건은 제4 성력이 먼저 나오지만 구획은 시간 탭 순서대로다.
    const groups = buildEraGroups(
      [ev(1, "가", "1년", fourth), ev(2, "나", "1년", third)],
      [third, fourth],
    );

    expect(groups.map((g) => g.name)).toEqual(["제3 성력", "제4 성력"]);
  });

  it("기간 없는 사건은 맨 뒤에 모은다", () => {
    const groups = buildEraGroups(
      [ev(1, "가", "언젠가", null), ev(2, "나", "1년", third)],
      [third],
    );

    expect(groups.map((g) => g.name)).toEqual(["제3 성력", NO_ERA_LABEL]);
    expect(groups[1].color).toBeNull();
    expect(groups[1].eventCount).toBe(1);
  });

  it("기간이 없는 사건이 하나도 없으면 그 구획은 만들지 않는다", () => {
    const groups = buildEraGroups([ev(1, "가", "1년", third)], [third]);

    expect(groups.map((g) => g.name)).toEqual(["제3 성력"]);
  });

  it("기간 목록에 없는 기간을 가리키는 사건도 잃지 않는다", () => {
    // 기간이 지워졌는데 사건이 아직 그것을 가리키는 경우.
    const groups = buildEraGroups([ev(1, "가", "1년", fourth)], [third]);

    expect(groups.map((g) => g.name)).toEqual(["제3 성력", "제4 성력"]);
    expect(groups[1].eventCount).toBe(1);
  });
});
