import type { Era, EventItem } from "./types";

/** 상위 기간 안에서 같은 하위 시각끼리 묶은 덩어리 */
export type EraTimeGroup = {
  /** 하위 시각 라벨 (상위 기간 이름은 붙이지 않는다) */
  displayTime: string;
  events: EventItem[];
};

/** 상위 기간 하나에 해당하는 구획 */
export type EraGroup = {
  /** 목록 key로 쓸 값. 기간이 없는 묶음은 "none". */
  id: string;
  name: string;
  /** 기간이 없는 묶음은 색도 없다 */
  color: string | null;
  /** 그 기간의 노트 경로. 없으면 null */
  path: string | null;
  times: EraTimeGroup[];
  eventCount: number;
};

/** 상위 기간을 지정하지 않은 사건을 모아 둘 묶음의 이름 */
export const NO_ERA_LABEL = "기간 없음";

/**
 * 사건을 "상위 기간 → 하위 시각" 두 단계로 묶는다.
 *
 * 격자(buildGrid)와 달리 **연속한 것만 묶지 않고 전부 모은다**. 격자의 행은
 * 시간순으로 흐르는 축이라 떨어져 있는 같은 값을 합치면 순서가 깨지지만,
 * 여기서는 기간이 곧 구획이므로 한 기간이 목록에 두 번 나오면 오히려 이상하다.
 *
 * 구획 순서는 시간 탭에서 정한 기간 순서(sort_key)를 따른다. 사건의 sort_key가
 * 아니라 기간의 순서를 쓰는 이유는, 기간이 무엇보다 먼저인 축이기 때문이다.
 * 기간이 없는 사건은 맨 뒤에 모은다.
 *
 * 사건이 하나도 없는 기간도 남긴다. 공간·인물 격자가 빈 열을 지우지 않는 것과
 * 같은 이유로, 만들어 둔 기간이 눈에 보여야 한다.
 *
 * @param events sort_key 오름차순 사건 목록
 * @param eras   시간 탭 순서대로 정렬된 기간 목록
 */
export function buildEraGroups(events: EventItem[], eras: Era[]): EraGroup[] {
  const groups = new Map<string, EraGroup>();

  for (const era of eras) {
    groups.set(String(era.id), {
      id: String(era.id),
      name: era.name,
      color: era.color,
      path: era.path,
      times: [],
      eventCount: 0,
    });
  }

  for (const event of events) {
    const key = event.era ? String(event.era.id) : "none";

    let group = groups.get(key);
    if (!group) {
      // 기간 없음 묶음은 그런 사건이 실제로 있을 때만 만든다.
      // 목록에 없는 기간을 가리키는 사건도 여기로 온다(삭제된 기간 등).
      group = {
        id: key,
        name: event.era?.name ?? NO_ERA_LABEL,
        color: event.era?.color ?? null,
        path: event.era?.path ?? null,
        times: [],
        eventCount: 0,
      };
      groups.set(key, group);
    }

    let time = group.times.find((t) => t.displayTime === event.displayTime);
    if (!time) {
      time = { displayTime: event.displayTime, events: [] };
      group.times.push(time);
    }

    time.events.push(event);
    group.eventCount += 1;
  }

  // 기간 없음은 항상 맨 뒤. 나머지는 eras에 넣은 순서 그대로다.
  const ordered = [...groups.values()];
  return [
    ...ordered.filter((g) => g.id !== "none"),
    ...ordered.filter((g) => g.id === "none"),
  ];
}
