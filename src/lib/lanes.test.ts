import { describe, expect, it } from "vitest";

import type { Character, Place } from "./types";

import { computeLanes, keepExistingLanes } from "./lanes";

function makePlace(id: number, name: string, color: string, path: string | null = null): Place {
  return { id: String(id), name, color, order: id * 10, path };
}

function makeCharacter(
  id: number,
  name: string,
  color: string,
  path: string | null = null,
): Character {
  return { id: String(id), name, color, order: id * 10, path };
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

describe("keepExistingLanes", () => {
  const lanes = computeLanes("place", [palace, forest], []);

  it("지금 있는 열만 남긴다", () => {
    const kept = keepExistingLanes(new Set(["place-1", "place-99"]), lanes);
    expect([...kept]).toEqual(["place-1"]);
  });

  it("전부 사라졌으면 빈 목록이 된다", () => {
    // 감춘 것이 없는데 "모두 보기"가 떠 있으면 안 된다.
    expect(keepExistingLanes(new Set(["place-99"]), lanes).size).toBe(0);
  });

  it("축이 바뀌어 id 앞머리가 다르면 남기지 않는다", () => {
    expect(keepExistingLanes(new Set(["character-1"]), lanes).size).toBe(0);
  });

  it("원래 목록을 건드리지 않는다", () => {
    const hidden = new Set(["place-1", "place-99"]);
    keepExistingLanes(hidden, lanes);
    expect(hidden.size).toBe(2);
  });
});
