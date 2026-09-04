import type { Character, Place } from "./types";

/** 격자의 한 열 (공간 하나 또는 인물 하나) */
export type Lane = { id: string; label: string; color: string };

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
