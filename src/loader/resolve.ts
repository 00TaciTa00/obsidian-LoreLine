import { displayTimeKey, formatDisplayTime } from "../lib/display-time";
import type { Character, Era, EventItem, LoreData, Place } from "../lib/types";
import { DEFAULT_COLOR, type ConfigEntry, type LoreConfig } from "./config";
import type { RawEvent } from "./parse";
import type { EntityNote, ScanResult } from "./scan";

/**
 * 이름 문자열 → 엔티티 객체 해소.
 *
 * 세 저장 위치(사건 노트 / 인물·장소 노트 / 정의 파일)를 name으로 잇는다.
 * 어느 한 쪽에만 있는 이름도 버리지 않는다. 색을 깜빡했다고 사건이 뷰에서
 * 사라지면 안 되고, 오타로 남은 이름은 눈에 보여야 고칠 수 있기 때문이다.
 */

/** 정의 파일에 order가 없거나 아예 없는 이름이 갈 자리 */
const BACK_OF_LIST = Number.MAX_SAFE_INTEGER;

type Entity = {
  id: string;
  name: string;
  color: string;
  order: number;
  path: string | null;
};

/**
 * 한 종류(인물·장소·기간)의 목록을 세운다.
 *
 * 이름은 정의 파일 → 개별 노트 → 사건이 참조한 것 순으로 합집합을 만든다.
 * 사건이 참조했지만 노트도 정의도 없는 이름까지 넣는 이유는, 빼면 그 사건이
 * 격자에서 통째로 사라지기 때문이다.
 *
 * 색과 순서는 정의 파일에서, 노트 경로는 개별 노트에서 온다. 둘 다 없을 수
 * 있고 그래도 목록에는 선다.
 */
function buildEntities(
  notes: EntityNote[],
  entries: ConfigEntry[],
  fromEvents: string[][],
): Entity[] {
  const defined = new Map(entries.map((entry) => [entry.name, entry]));
  const paths = new Map(notes.map((note) => [note.name, note.path]));

  const names = new Set<string>();
  for (const entry of entries) names.add(entry.name);
  for (const note of notes) names.add(note.name);
  for (const list of fromEvents) for (const name of list) names.add(name);

  const entities: Entity[] = [];
  for (const name of names) {
    const entry = defined.get(name);
    entities.push({
      id: name,
      name,
      color: entry?.color ?? DEFAULT_COLOR,
      order: entry?.order ?? BACK_OF_LIST,
      path: paths.get(name) ?? null,
    });
  }

  // order가 같으면 이름순. 순서를 안 정한 것들끼리도 볼 때마다 뒤바뀌지 않게 한다.
  return entities.sort(
    (a, b) => a.order - b.order || a.name.localeCompare(b.name, "ko"),
  );
}

/**
 * 정의 파일에는 있는데 개별 노트가 없는 이름 (오타·삭제 탐지용).
 *
 * 노트를 아직 하나도 안 만든 종류는 검사하지 않는다. 인물 노트를 쓰지 않기로
 * 했을 뿐인데 정의 파일 전체가 경고로 쏟아지면 쓸모가 없다.
 */
function findOrphans(entries: ConfigEntry[], notes: EntityNote[], noun: string): string[] {
  if (notes.length === 0) return [];

  const existing = new Set(notes.map((note) => note.name));
  return entries
    .map((entry) => entry.name)
    .filter((name) => !existing.has(name))
    .map((name) => `정의 파일의 ${noun} "${name}"에 해당하는 노트가 없다.`);
}

/**
 * 같은 정렬값을 여러 사건이 나눠 쓰는 경우.
 *
 * 채번이 자동이 아니라 손으로 적는 구조라 흔하다. 순서가 경로순으로 밀려
 * 의도와 다르게 서게 되므로 알려 준다. 정렬값을 아예 안 적은 사건은 스캔
 * 단계에서 이미 알렸으니 여기서 두 번 세지 않는다.
 */
function findDuplicateSortKeys(events: EventItem[]): string[] {
  const byKey = new Map<number, EventItem[]>();
  for (const event of events) {
    if (event.sortKey === Number.MAX_SAFE_INTEGER) continue;
    const bucket = byKey.get(event.sortKey);
    if (bucket) bucket.push(event);
    else byKey.set(event.sortKey, [event]);
  }

  const warnings: string[] = [];
  for (const [sortKey, bucket] of byKey) {
    if (bucket.length < 2) continue;
    const titles = bucket.map((event) => event.title).join(", ");
    // 숫자 뒤 조사는 읽는 방식에 따라 을/를이 갈린다. 아예 붙이지 않는다.
    warnings.push(`정렬값 ${sortKey}: 사건 ${bucket.length}건이 함께 쓴다 — ${titles}`);
  }
  return warnings;
}

/**
 * 같은 작중 시각인데 정렬값 순서상 떨어져 있는 경우.
 *
 * 격자(buildGrid)는 **잇달아 오는** 사건만 한 행으로 묶는다. 시간축이 흐르는
 * 순서라 떨어진 것을 합치면 순서가 깨지기 때문이다. 그래서 정렬값을 잘못
 * 적으면 같은 시각이 격자에 여러 행으로 갈려 나타난다. 보고 나서야 아는 대신
 * 미리 알린다.
 */
function findSplitRows(events: EventItem[]): string[] {
  const runs = new Map<string, number>();
  let previous: string | null = null;

  for (const event of events) {
    const key = displayTimeKey(event);
    if (key !== previous) runs.set(key, (runs.get(key) ?? 0) + 1);
    previous = key;
  }

  const warnings: string[] = [];
  for (const event of events) {
    const key = displayTimeKey(event);
    const count = runs.get(key) ?? 0;
    if (count < 2) continue;
    // 한 시각당 한 번만 알린다.
    runs.set(key, 0);
    warnings.push(
      `"${formatDisplayTime(event)}"이 정렬값 순서상 떨어져 있어 격자에서 ${count}개 행으로 갈린다.`,
    );
  }
  return warnings;
}

/** 사건 하나를 EventItem으로. 이름 참조를 실제 객체로 바꾼다. */
function resolveEvent(
  raw: RawEvent,
  places: Map<string, Place>,
  characters: Map<string, Character>,
  eras: Map<string, Era>,
): EventItem {
  return {
    id: raw.path,
    path: raw.path,
    title: raw.title,
    description: raw.description,
    era: raw.eraName ? (eras.get(raw.eraName) ?? null) : null,
    displayTime: raw.displayTime,
    sortKey: raw.sortKey,
    // 목록에 없는 이름은 위에서 이미 채워 넣었으므로 여기서 빠지는 일은 없다.
    places: raw.placeNames.map((name) => places.get(name)).filter(isPresent),
    characters: raw.characterNames.map((name) => characters.get(name)).filter(isPresent),
  };
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

/**
 * 스캔 결과 + 정의 파일 → 뷰에 넘길 한 덩어리.
 *
 * 사건은 sortKey 오름차순으로 정렬한다. 읽기 전용이라 채번·재정렬은 하지 않고
 * 적힌 값을 그대로 쓴다.
 */
export function buildLoreData(scan: ScanResult, config: LoreConfig): LoreData {
  const places = buildEntities(
    scan.places,
    config.places,
    scan.events.map((event) => event.placeNames),
  );
  const characters = buildEntities(
    scan.characters,
    config.characters,
    scan.events.map((event) => event.characterNames),
  );
  const eras = buildEntities(
    scan.eras,
    config.eras,
    scan.events.map((event) => (event.eraName ? [event.eraName] : [])),
  );

  const placeById = new Map(places.map((place) => [place.name, place]));
  const characterById = new Map(characters.map((character) => [character.name, character]));
  const eraById = new Map(eras.map((era) => [era.name, era]));

  const events = scan.events
    .map((raw) => resolveEvent(raw, placeById, characterById, eraById))
    // sortKey가 같으면 경로순. 같은 값을 여러 사건에 써도 순서가 흔들리지 않게 한다.
    .sort((a, b) => a.sortKey - b.sortKey || a.path.localeCompare(b.path, "ko"));

  return {
    events,
    places,
    characters,
    eras,
    warnings: [
      ...findOrphans(config.places, scan.places, "장소"),
      ...findOrphans(config.characters, scan.characters, "인물"),
      ...findOrphans(config.eras, scan.eras, "기간"),
      ...findDuplicateSortKeys(events),
      ...findSplitRows(events),
    ],
  };
}
