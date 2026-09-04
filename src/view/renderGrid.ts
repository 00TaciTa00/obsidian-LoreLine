import type { App } from "obsidian";

import { buildGrid, laneEventCounts } from "../lib/grid";
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
};

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
 * 공간별·인물별 뷰. 세로축=시간, 가로축=공간 또는 인물인 표를 그린다.
 *
 * 두 뷰는 축만 다르고 나머지가 같아서 한 함수로 둔다. 사건이 하나도 없는 열도
 * 남긴다 — 만들어 둔 공간·인물이 눈에 보여야 한다. 열이 많아 표가 넓어지면
 * 위쪽 칩으로 끄고 켠다.
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

  const visible = new Set(shown.map((lane) => lane.id));
  const rows = buildGrid(data.events, axis, visible);

  const table = container.createEl("table", { cls: "loreline-grid" });

  const head = table.createEl("thead").createEl("tr");
  head.createEl("th", { cls: "loreline-grid-corner", text: "시간" });
  for (const lane of shown) {
    const cell = head.createEl("th", { cls: "loreline-grid-lane" });
    cell.style.setProperty("--loreline-lane-color", lane.color);

    const label = cell.createSpan({ cls: "loreline-lane-name", text: lane.label });
    // 노트가 있는 열만 누를 수 있다. 정의 파일에만 적힌 이름은 갈 곳이 없다.
    if (lane.path) asNoteLink(label, app, lane.path, `${lane.label} ${noun} 노트 열기`);

    cell.createSpan({ cls: "loreline-lane-count", text: `${counts.get(lane.id) ?? 0}` });
  }

  const body = table.createEl("tbody");

  if (rows.length === 0) {
    const empty = body.createEl("tr").createEl("td", {
      cls: "loreline-empty",
      text: `켜 둔 ${noun}에 걸린 사건이 없다.`,
    });
    empty.colSpan = shown.length + 1;
    return;
  }

  for (const row of rows) {
    const tr = body.createEl("tr");

    // 기간과 시각을 두 줄로 나눈다. 한 줄에 붙여 놓으면 열이 넓어지고, 기간이
    // 같은 행이 이어질 때 눈이 시각만 따라가기 어렵다.
    const timeCell = tr.createEl("th", { cls: "loreline-grid-time" });
    if (row.eraColor) timeCell.style.setProperty("--loreline-era-color", row.eraColor);

    if (row.eraName) {
      const era = timeCell.createSpan({ cls: "loreline-grid-era", text: row.eraName });
      if (row.eraPath) asNoteLink(era, app, row.eraPath, `${row.eraName} 기간 노트 열기`);
      timeCell.createSpan({ cls: "loreline-grid-hour", text: row.time });
    } else {
      timeCell.createSpan({ cls: "loreline-grid-hour is-alone", text: row.time });
    }

    for (const lane of shown) {
      const td = tr.createEl("td", { cls: "loreline-grid-cell" });
      for (const event of row.cells.get(lane.id) ?? []) {
        renderEventCard(td, app, event);
      }
    }
  }
}
