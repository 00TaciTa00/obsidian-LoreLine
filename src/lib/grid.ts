import type { EventItem } from "./types";

import { displayTimeKey, formatDisplayTime } from "./display-time";
import type { Lane } from "./lanes";

/**
 * 세로축=시간, 가로축=인물/공간 격자 배치.
 *
 * 사건 목록은 이미 sort_key 오름차순으로 들어온다. 같은 작중 시각
 * (display_time)을 가진 사건들은 "동시간대"로 보고 한 행에 묶어, 서로 다른
 * 인물·공간에서 동시에 벌어진 일이 가로로 나란히 보이게 한다.
 *
 * 라벨이 자유 문자열이라 정확히 같을 때만 묶는다. "3년째 겨울"과
 * "3년째 겨울(밤)"은 다른 행이 된다.
 */
export type GridRow = {
  /** 이 행에 보여줄 작중 시각 (상위 기간이 있으면 합쳐진 형태) */
  displayTime: string;
  /**
   * 상위 기간 이름. 없으면 null.
   *
   * 격자의 시간 칸은 기간과 시각을 두 줄로 나눠 보여주므로 합쳐진 형태만으로는
   * 부족하다. eraColor와 같은 이유로 여기 담아 둔다 — 보는 쪽이 행 안의 사건을
   * 뒤져 알아내지 않아도 되게.
   */
  eraName: string | null;
  /** 상위 기간을 뺀 하위 시각 그대로 */
  time: string;
  /** 같은 행으로 묶을지 판단하는 값 (상위+하위) */
  key: string;
  /**
   * 이 행이 속한 상위 기간의 색. 기간이 없으면 null.
   *
   * 행은 상위 기간까지 같아야 묶이므로(key에 기간이 들어간다) 행 안의 사건은
   * 모두 같은 기간이다. 그래도 여기 담아 두는 편이 낫다. 보는 쪽이 key의
   * 구현에 기대지 않아도 되기 때문이다.
   */
  eraColor: string | null;
  /** laneId -> 그 칸에 놓일 사건들 */
  cells: Map<string, EventItem[]>;
  /** 행에 포함된 전체 사건 (레인에 안 걸린 것도 포함) */
  events: EventItem[];
};

/** 사건이 어떤 레인에 속하는지 (뷰 모드에 따라 공간 또는 인물 기준) */
function laneIdsOf(event: EventItem, axis: "place" | "character"): string[] {
  return axis === "place"
    ? event.places.map((p) => `place-${p.id}`)
    : event.characters.map((c) => `character-${c.id}`);
}

/**
 * 사건들을 시간 행 × 레인 열 격자로 배치한다.
 *
 * @param events sort_key 오름차순 사건 목록
 * @param axis   가로축 기준 (공간별/인물별)
 * @param visibleLaneIds 보여줄 레인. 여기 없는 레인의 사건은 칸에 놓이지 않는다.
 */
export function buildGrid(
  events: EventItem[],
  axis: "place" | "character",
  visibleLaneIds: Set<string>,
): GridRow[] {
  const rows: GridRow[] = [];

  for (const event of events) {
    const laneIds = laneIdsOf(event, axis).filter((id) =>
      visibleLaneIds.has(id),
    );

    // 보이는 레인에 하나도 안 걸리면 이 사건은 격자에서 제외한다.
    if (laneIds.length === 0) continue;

    // 직전 행과 작중 시각이 같으면 같은 행에 합친다.
    // 상위 기간까지 같아야 한다("제3 성력 - 1년"과 "제4 성력 - 1년"은 다른 행).
    const key = displayTimeKey(event);
    let row = rows.at(-1);
    if (!row || row.key !== key) {
      const eraName = event.era?.name.trim();
      row = {
        displayTime: formatDisplayTime(event),
        // formatDisplayTime과 같은 기준으로 본다. 공백뿐인 이름은 없는 것이다.
        eraName: eraName ? eraName : null,
        time: event.displayTime,
        key,
        eraColor: event.era?.color ?? null,
        cells: new Map(),
        events: [],
      };
      rows.push(row);
    }

    row.events.push(event);
    for (const laneId of laneIds) {
      const cell = row.cells.get(laneId) ?? [];
      cell.push(event);
      row.cells.set(laneId, cell);
    }
  }

  return rows;
}

/** 필터링에 쓸 레인 목록 (사건이 하나도 없는 레인도 포함해 끄고 켤 수 있게 한다) */
export function laneEventCounts(
  events: EventItem[],
  lanes: Lane[],
  axis: "place" | "character",
): Map<string, number> {
  const counts = new Map<string, number>(lanes.map((l) => [l.id, 0]));

  for (const event of events) {
    for (const laneId of laneIdsOf(event, axis)) {
      if (counts.has(laneId)) {
        counts.set(laneId, counts.get(laneId)! + 1);
      }
    }
  }

  return counts;
}
