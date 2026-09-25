import type { EventItem } from "./types";

import type { GridRow } from "./grid";

/**
 * 격자 한 행의 가로 배치를 정한다.
 *
 * 전에는 사건 하나가 참여 인물 수만큼 복제돼 칸마다 따로 그려졌다. "기어코,
 * 그 날"이 베르크 열과 린다 열에 똑같이 한 장씩 있었고, 두 인물이 같은 자리에
 * 있었다는 사실은 화면에 남지 않았다. 이제 한 장이 양쪽 열을 가로지른다.
 *
 * 가로지르면 가운데 열을 덮는 문제가 생긴다. 사이에 낀 인물에게 같은 시각의
 * 다른 사건이 있으면 자리가 없다. 그래서 **행을 단으로 나눈다.** 가로로 겹치는
 * 사건은 아래 단으로 내려간다.
 */

/** 한 행에 놓이는 사건 하나의 자리 */
export type Placement = {
  event: EventItem;
  /** 보이는 레인 기준 시작·끝 열 인덱스 (0-based, 양끝 포함) */
  startLane: number;
  endLane: number;
  /**
   * 실제로 참여하는 레인 인덱스들.
   *
   * start~end 사이에 참여하지 않는 열이 낄 수 있다. 카드 상단 띠를 이 위치에만
   * 찍어야 "가운데 열도 참여한다"는 오해가 줄어든다.
   */
  laneIndexes: number[];
  /** 행 안에서 몇 번째 단인가 (0-based) */
  track: number;
};

export type RowLayout = {
  placements: Placement[];
  /** 이 행이 차지하는 단 수. 최소 1. */
  trackCount: number;
};

/** 두 구간이 가로로 겹치는가 (양끝 포함) */
function overlaps(a: Placement, startLane: number, endLane: number): boolean {
  return a.startLane <= endLane && startLane <= a.endLane;
}

/**
 * 한 행의 사건들을 가로 구간 + 단으로 배치한다.
 *
 * @param laneIds 화면에 보이는 레인 id를 왼쪽부터 나열한 것
 */
export function layoutRow(row: GridRow, laneIds: string[]): RowLayout {
  const laneIndexById = new Map(laneIds.map((id, index) => [id, index]));

  // 사건 하나가 걸친 레인 인덱스를 모은다.
  const indexesByEvent = new Map<string, number[]>();
  for (const [laneId, events] of row.cells) {
    const index = laneIndexById.get(laneId);
    if (index === undefined) continue;
    for (const event of events) {
      const indexes = indexesByEvent.get(event.id) ?? [];
      indexes.push(index);
      indexesByEvent.set(event.id, indexes);
    }
  }

  const placements: Placement[] = [];
  // 단마다 이미 놓인 것들. 겹치는지 보려고 들고 있는다.
  const tracks: Placement[][] = [];

  // row.events 순서(작중 시간순)를 따른다. 같은 입력이면 같은 배치가 나온다.
  for (const event of row.events) {
    const indexes = indexesByEvent.get(event.id);
    if (!indexes || indexes.length === 0) continue;

    const sorted = [...indexes].sort((a, b) => a - b);
    const startLane = sorted[0];
    const endLane = sorted[sorted.length - 1];

    // 겹치지 않는 첫 단에 놓는다.
    let track = tracks.findIndex(
      (placed) => !placed.some((p) => overlaps(p, startLane, endLane)),
    );
    if (track === -1) {
      track = tracks.length;
      tracks.push([]);
    }

    const placement: Placement = {
      event,
      startLane,
      endLane,
      laneIndexes: sorted,
      track,
    };
    tracks[track].push(placement);
    placements.push(placement);
  }

  return { placements, trackCount: Math.max(1, tracks.length) };
}

/** 한 레인이 처음·마지막으로 나오는 행 인덱스 */
export type LaneLifespan = { first: number; last: number };

/**
 * 레인마다 첫 등장 행과 마지막 등장 행을 찾는다.
 *
 * 인물 흐름선을 이 구간에만 긋는다. 격자 전체 높이로 그으면 선이 길이 정보를
 * 잃어, 고대에만 있는 인물과 끝까지 가는 인물이 똑같아 보인다.
 */
export function laneLifespans(
  rows: GridRow[],
  laneIds: string[],
): Map<string, LaneLifespan> {
  const spans = new Map<string, LaneLifespan>();

  rows.forEach((row, rowIndex) => {
    for (const laneId of laneIds) {
      const cell = row.cells.get(laneId);
      if (!cell || cell.length === 0) continue;

      const found = spans.get(laneId);
      if (!found) {
        spans.set(laneId, { first: rowIndex, last: rowIndex });
      } else {
        found.last = rowIndex;
      }
    }
  });

  return spans;
}
