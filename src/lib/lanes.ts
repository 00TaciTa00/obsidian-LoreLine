import type { Character, Place } from "./types";

/** 격자의 한 열 (공간 하나 또는 인물 하나) */
export type Lane = { id: string; label: string; color: string };

/**
 * 감춘 열 목록에서 지금 없는 것을 걸러낸다.
 *
 * 노트를 지우거나 이름을 바꾸면 감춘 목록에 유령 id가 남는다. 그대로 두면
 * 감춘 것이 없는데도 "모두 보기"가 계속 떠 있게 된다.
 *
 * (이식한 것이 아니라 옵시디언 쪽에서 새로 필요해진 함수다.)
 */
export function keepExistingLanes(hidden: Set<string>, lanes: Lane[]): Set<string> {
  const ids = new Set(lanes.map((lane) => lane.id));
  return new Set([...hidden].filter((id) => ids.has(id)));
}

/**
 * 격자의 가로축을 이룰 열 목록. 사건이 하나도 없는 공간·인물도 포함해서,
 * 필터에서 끄고 켤 수 있고 빈 열도 눈에 보이게 한다.
 */
export function computeLanes(
  axis: "place" | "character",
  places: Place[],
  characters: Character[],
): Lane[] {
  if (axis === "place") {
    return places.map((p) => ({
      id: `place-${p.id}`,
      label: p.name,
      color: p.color,
    }));
  }
  return characters.map((c) => ({
    id: `character-${c.id}`,
    label: c.name,
    color: c.color,
  }));
}
