import { describe, expect, it } from "vitest";

import type { Character, Place } from "./types";

import { computeLanes } from "./lanes";

function makePlace(id: number, name: string, color: string): Place {
  return { id: String(id), name, color, order: id * 10 };
}

function makeCharacter(id: number, name: string, color: string): Character {
  return { id: String(id), name, color, order: id * 10 };
}

const palace = makePlace(1, "왕궁", "#ef4444");
const forest = makePlace(2, "숲", "#22c55e");
const eirin = makeCharacter(1, "에이린", "#3b82f6");
const kasl = makeCharacter(2, "카슬", "#a855f7");

describe("computeLanes", () => {
  it("공간축은 공간마다 열을 만들고 공간 색을 쓴다", () => {
    const lanes = computeLanes("place", [palace, forest], [eirin]);

    expect(lanes.map((l) => l.id)).toEqual(["place-1", "place-2"]);
    expect(lanes.map((l) => l.label)).toEqual(["왕궁", "숲"]);
    expect(lanes[0].color).toBe("#ef4444");
  });

  it("인물축은 인물마다 열을 만든다", () => {
    const lanes = computeLanes("character", [palace], [eirin, kasl]);

    expect(lanes.map((l) => l.id)).toEqual(["character-1", "character-2"]);
    expect(lanes.map((l) => l.label)).toEqual(["에이린", "카슬"]);
    expect(lanes[1].color).toBe("#a855f7");
  });

  it("축이 아닌 쪽 목록은 열에 영향을 주지 않는다", () => {
    // 공간축을 볼 때 인물이 몇 명이든 열 수는 공간 수와 같아야 한다.
    expect(computeLanes("place", [palace], [eirin, kasl])).toHaveLength(1);
  });

  it("해당 축에 등록된 것이 없으면 열도 없다", () => {
    expect(computeLanes("place", [], [eirin])).toEqual([]);
    expect(computeLanes("character", [palace], [])).toEqual([]);
  });
});
