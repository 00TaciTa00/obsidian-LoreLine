import type { App } from "obsidian";

import { buildGrid, laneEventCounts, type GridRow } from "../lib/grid";
import { laneLifespans, layoutRow, type LaneLifespan } from "../lib/grid-layout";
import { computeLanes, type Lane } from "../lib/lanes";
import type { LoreData } from "../lib/types";
import { asNoteLink, renderEmpty, renderEventCard } from "./shared";

/** 격자 뷰가 바깥(뷰)과 주고받는 것 */
export type GridOptions = {
  /** 감춘 레인 id. 뷰가 들고 있어 모드를 오가도 유지된다. */
  hidden: Set<string>;
  /** 열 칩을 눌렀을 때. 뷰가 상태를 바꾸고 다시 그린다. */
  onToggle: (laneId: string) => void;
  /** "모두 보기"를 눌렀을 때 */
  onShowAll: () => void;
  /** 칩을 다 펼쳐 둔 사건의 id. 뷰가 들고 있어 다시 그려도 유지된다. */
  expanded: Set<string>;
  /** 카드의 +N / -N 을 눌렀을 때 */
  onToggleChips: (eventId: string) => void;
};

/**
 * 격자 카드에 접힌 채 보일 칩 수 (원본 92e3654).
 *
 * 3개면 이름이 조금만 길어도 좁은 열에서 두 줄로 넘어가 카드 높이가
 * 들쭉날쭉했다. 2개면 대개 한 줄에 들어간다.
 */
const CHIP_LIMIT = 2;

/** 열을 끄고 켜는 칩 줄. 사건이 없는 열도 남아 있어야 켜 볼 수 있다. */
function renderFilter(
  parent: HTMLElement,
  lanes: Lane[],
  counts: Map<string, number>,
  options: GridOptions,
): void {
  const bar = parent.createDiv({ cls: "loreline-filter" });
  bar.setAttribute("role", "group");
  bar.setAttribute("aria-label", "열 필터");

  for (const lane of lanes) {
    const chip = bar.createEl("button", { cls: "loreline-chip" });
    chip.style.setProperty("--loreline-lane-color", lane.color);

    const hidden = options.hidden.has(lane.id);
    if (hidden) chip.addClass("is-off");
    chip.setAttribute("aria-pressed", String(!hidden));

    chip.createSpan({ cls: "loreline-chip-dot" });
    chip.createSpan({ cls: "loreline-chip-name", text: lane.label });
    chip.createSpan({ cls: "loreline-chip-count", text: `${counts.get(lane.id) ?? 0}` });

    chip.addEventListener("click", () => options.onToggle(lane.id));
  }

  if (options.hidden.size > 0) {
    const all = bar.createEl("button", { cls: "loreline-chip-all", text: "모두 보기" });
    all.addEventListener("click", () => options.onShowAll());
  }
}

/**
 * 공간별·인물별 뷰. 세로축=시간, 가로축=공간 또는 인물인 격자를 그린다.
 *
 * 두 뷰는 축만 다르고 나머지가 같아서 한 함수로 둔다. 사건이 하나도 없는 열도
 * 남긴다 — 만들어 둔 공간·인물이 눈에 보여야 한다. 열이 많아 격자가 넓어지면
 * 위쪽 칩으로 끄고 켠다.
 *
 * 한 사건이 여러 열에 걸치면 **카드 한 장이 그 구간을 가로지른다**(원본
 * 432028c). 전에는 열마다 복제돼 같은 제목이 여러 번 읽혔고, 둘이 같은 자리에
 * 있었다는 사실이 화면에 남지 않았다. 가로지르느라 가운데 열을 덮는 문제는 행을
 * 단으로 나눠 푼다(lib/grid-layout.ts). 그래서 `<table>`이 아니라 행마다 CSS
 * grid를 쓴다. 칸 안에 카드를 넣는 표로는 여러 칸에 걸친 카드를 놓을 수 없다.
 */
export function renderGrid(
  container: HTMLElement,
  app: App,
  data: LoreData,
  axis: "place" | "character",
  options: GridOptions,
): void {
  const lanes = computeLanes(axis, data.places, data.characters);
  const noun = axis === "place" ? "장소" : "인물";

  if (lanes.length === 0) {
    renderEmpty(container, `${noun} 노트가 없다. frontmatter에 loreline: ${axis} 를 넣어 보라.`);
    return;
  }

  const counts = laneEventCounts(data.events, lanes, axis);
  renderFilter(container, lanes, counts, options);

  const shown = lanes.filter((lane) => !options.hidden.has(lane.id));
  if (shown.length === 0) {
    renderEmpty(container, `${noun}을 모두 감췄다. 위에서 다시 켜라.`);
    return;
  }

  const laneIds = shown.map((lane) => lane.id);
  const rows = buildGrid(data.events, axis, new Set(laneIds));

  const grid = container.createDiv({ cls: "loreline-grid" });
  // 행마다 따로 grid라 열 폭이 내용을 따라가면 행끼리 어긋난다. 폭은 CSS에서
  // 고정하고 열 개수만 여기서 준다.
  grid.style.setProperty("--loreline-lane-count", String(shown.length));

  renderGridHead(grid, app, shown, counts, noun);

  if (rows.length === 0) {
    renderEmpty(grid, `켜 둔 ${noun}에 걸린 사건이 없다.`);
    return;
  }

  /**
   * 열마다 첫 등장 ~ 마지막 등장 행. 흐름선을 이 사이에만 긋는다.
   *
   * 인물별 격자에만 그린다(원본 0029910). 선의 길이가 "이 인물이 언제부터
   * 언제까지의 인물인가"를 말해 주기 때문이다. 장소는 사건 사이에 사라지는 것이
   * 아니라 그동안 안 쓰였을 뿐이라 그렇게 읽히지 않는다.
   */
  const lifespans = axis === "character" ? laneLifespans(rows, laneIds) : new Map();

  rows.forEach((row, rowIndex) => {
    const { placements, trackCount } = layoutRow(row, laneIds);

    const line = grid.createDiv({ cls: "loreline-grid-row" });
    // 단 수만큼 줄을 만든다. 가로로 겹친 사건이 아래 단으로 내려간다.
    line.style.setProperty("grid-template-rows", `repeat(${trackCount}, auto)`);

    renderTimeCell(line, app, row);

    // 열 배경: 구분선과 흐름선. 카드는 그 위에 따로 놓는다.
    shown.forEach((lane, laneIndex) => {
      const bg = line.createDiv({ cls: "loreline-grid-bg" });
      bg.style.setProperty("grid-column", String(laneIndex + 2));
      bg.style.setProperty("--loreline-lane-color", lane.color);
      renderFlow(bg, lifespans.get(lane.id), rowIndex);
    });

    for (const placement of placements) {
      const slot = line.createDiv({ cls: "loreline-grid-slot" });
      // 격자 열 번호는 1부터고 1번은 시각 열이라 +2. 끝은 그 다음 선이라 +3.
      slot.style.setProperty(
        "grid-column",
        `${placement.startLane + 2} / ${placement.endLane + 3}`,
      );
      slot.style.setProperty("grid-row", String(placement.track + 1));

      const { event } = placement;
      renderEventCard(slot, app, event, {
        // 카드가 덮는 열마다 한 칸. 참여하는 열에만 색을 찍어, 가운데 낀 열까지
        // 참여한다고 오해받지 않게 한다.
        lanes: shown
          .slice(placement.startLane, placement.endLane + 1)
          .map((lane, offset) =>
            placement.laneIndexes.includes(placement.startLane + offset) ? lane.color : null,
          ),
        // 격자의 축이 아닌 쪽을 곁들인다. 공간별이면 인물, 인물별이면 공간.
        chips: {
          entities: axis === "place" ? event.characters : event.places,
          limit: CHIP_LIMIT,
          expanded: options.expanded.has(event.id),
          onToggle: () => options.onToggleChips(event.id),
        },
      });
    }
  });
}

/** 열 머리글. 세로로 스크롤해도 남는다. */
function renderGridHead(
  grid: HTMLElement,
  app: App,
  lanes: Lane[],
  counts: Map<string, number>,
  noun: string,
): void {
  const head = grid.createDiv({ cls: "loreline-grid-head" });
  head.createDiv({ cls: "loreline-grid-corner", text: "시간" });

  for (const lane of lanes) {
    const cell = head.createDiv({ cls: "loreline-grid-lane" });
    cell.style.setProperty("--loreline-lane-color", lane.color);

    const label = cell.createSpan({ cls: "loreline-lane-name", text: lane.label });
    // 노트가 있는 열만 누를 수 있다. 정의 파일에만 적힌 이름은 갈 곳이 없다.
    if (lane.path) asNoteLink(label, app, lane.path, `${lane.label} ${noun} 노트 열기`);

    cell.createSpan({ cls: "loreline-lane-count", text: `${counts.get(lane.id) ?? 0}` });
  }
}

/**
 * 행 머리의 시간 칸. 단이 여러 개여도 시각은 한 번만 쓰므로 세로로 관통한다.
 *
 * 기간과 시각을 두 줄로 나눈다. 한 줄에 붙여 놓으면 열이 넓어지고, 기간이
 * 같은 행이 이어질 때 눈이 시각만 따라가기 어렵다.
 */
function renderTimeCell(line: HTMLElement, app: App, row: GridRow): void {
  const cell = line.createDiv({ cls: "loreline-grid-time" });
  if (row.eraColor) cell.style.setProperty("--loreline-era-color", row.eraColor);

  if (row.eraName) {
    const era = cell.createSpan({ cls: "loreline-grid-era", text: row.eraName });
    if (row.eraPath) asNoteLink(era, app, row.eraPath, `${row.eraName} 기간 노트 열기`);
    cell.createSpan({ cls: "loreline-grid-hour", text: row.time });
  } else {
    cell.createSpan({ cls: "loreline-grid-hour is-alone", text: row.time });
  }
}

/**
 * 한 열 배경의 흐름선 조각.
 *
 * 그 인물이 처음 나오는 행에서 시작해 마지막 행에서 끝난다. 격자 전체 높이로
 * 그으면 선의 길이가 아무것도 말해 주지 않아, 앞에만 나오는 인물과 끝까지 가는
 * 인물이 똑같아 보인다. 첫 행은 가운데서 시작하고 마지막 행은 가운데서 끝나며,
 * 양끝에 점을 찍는다.
 */
function renderFlow(bg: HTMLElement, lifespan: LaneLifespan | undefined, rowIndex: number): void {
  if (!lifespan || rowIndex < lifespan.first || rowIndex > lifespan.last) return;

  const isFirst = rowIndex === lifespan.first;
  const isLast = rowIndex === lifespan.last;

  const flow = bg.createSpan({ cls: "loreline-flow" });
  flow.setAttribute("aria-hidden", "true");
  if (isFirst) flow.addClass("is-first");
  if (isLast) flow.addClass("is-last");

  if (isFirst || isLast) {
    bg.createSpan({ cls: "loreline-flow-dot" }).setAttribute("aria-hidden", "true");
  }
}
