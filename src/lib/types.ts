/**
 * LoreLine 웹앱의 `lib/api/types.ts`를 옵시디언 인메모리 모델로 줄인 것.
 *
 * DB 컬럼(worldId, timelineId, createdAt, updatedAt, deletedAt)은 저장소가
 * 볼트의 마크다운이므로 전부 뺐다. id는 이름 문자열을 그대로 쓴다. 세 저장
 * 위치(사건 노트 / 인물·장소 노트 / 정의 파일)를 name으로 잇기 때문에
 * 이름이 곧 식별자다.
 */

export type Era = {
  /** 이름과 같다. 격자·기간 묶음의 key로 쓰인다. */
  id: string;
  name: string;
  color: string;
  /** 정의 파일에서 온 목록 순서. 오름차순. */
  order: number;
  /**
   * 이 이름의 개별 노트 경로. 없으면 null.
   *
   * 정의 파일에만 적혀 있거나 사건이 이름만 가리키는 경우에는 열 노트가 없다.
   * 뷰에서 이름을 눌러 문서로 갈 수 있는지가 이 값으로 갈린다.
   */
  path: string | null;
};

export type Place = {
  id: string;
  name: string;
  color: string;
  order: number;
  path: string | null;
};

export type Character = {
  id: string;
  name: string;
  color: string;
  order: number;
  path: string | null;
};

export type EventItem = {
  /** 노트의 볼트 경로. 사건 1개 = 노트 1개라 경로가 식별자가 된다. */
  id: string;
  path: string;
  /** 파일명(확장자 제외) 또는 H1 */
  title: string;
  /** 본문에서 뽑은 설명 */
  description: string | null;
  era: Era | null;
  displayTime: string;
  /** frontmatter의 정렬 전용 숫자. 오름차순 정렬에만 쓴다. */
  sortKey: number;
  color: string | null;
  places: Place[];
  characters: Character[];
};

/** 로더가 완성해 뷰에 넘기는 한 덩어리 */
export type LoreData = {
  events: EventItem[];
  places: Place[];
  characters: Character[];
  eras: Era[];
  /**
   * 사람이 고쳐야 할 것들. 뷰를 막지는 않는다.
   *
   * 오타로 남은 이름, 겹친 정렬값, 순서가 어긋나 갈라진 행처럼 "보이기는
   * 보이는데 의도와 다른" 상태를 모은다. 읽기 전용이라 고치는 것은 노트를
   * 손보는 쪽이고, 여기서는 알리기만 한다.
   */
  warnings: string[];
};
