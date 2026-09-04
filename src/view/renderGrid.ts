import type { App } from "obsidian";

import { buildGrid, laneEventCounts } from "../lib/grid";
import { computeLanes } from "../lib/lanes";
import type { LoreData } from "../lib/types";
import { renderEmpty, renderEventCard } from "./shared";

/**
 * 공간별·인물별 뷰. 세로축=시간, 가로축=공간 또는 인물인 표를 그린다.
 *
 * 두 뷰는 축만 다르고 나머지가 같아서 한 함수로 둔다. 사건이 하나도 없는 열도
 * 남긴다 — 만들어 둔 공간·인물이 눈에 보여야 한다.
 */
export function renderGrid(
  container: HTMLElement,
  app: App,
  data: LoreData,
  axis: "place" | "character",
): void {
  const lanes = computeLanes(axis, data.places, data.characters);
  const noun = axis === "place" ? "장소" : "인물";

  if (lanes.length === 0) {
    renderEmpty(container, `${noun} 노트가 없다. frontmatter에 loreline: ${axis} 를 넣어 보라.`);
    return;
  }

  const visible = new Set(lanes.map((lane) => lane.id));
  const rows = buildGrid(data.events, axis, visible);
  const counts = laneEventCounts(data.events, lanes, axis);

  const table = container.createEl("table", { cls: "loreline-grid" });

  const head = table.createEl("thead").createEl("tr");
  head.createEl("th", { cls: "loreline-grid-corner", text: "시간" });
  for (const lane of lanes) {
    const cell = head.createEl("th", { cls: "loreline-grid-lane" });
    cell.style.setProperty("--loreline-lane-color", lane.color);
    cell.createSpan({ cls: "loreline-lane-name", text: lane.label });
    cell.createSpan({ cls: "loreline-lane-count", text: `${counts.get(lane.id) ?? 0}` });
  }

  const body = table.createEl("tbody");

  if (rows.length === 0) {
    const empty = body.createEl("tr").createEl("td", {
      cls: "loreline-empty",
      text: `이 ${noun}들에 걸린 사건이 없다.`,
    });
    empty.colSpan = lanes.length + 1;
    return;
  }

  for (const row of rows) {
    const tr = body.createEl("tr");

    const timeCell = tr.createEl("th", { cls: "loreline-grid-time" });
    if (row.eraColor) timeCell.style.setProperty("--loreline-era-color", row.eraColor);
    timeCell.createSpan({ text: row.displayTime });

    for (const lane of lanes) {
      const td = tr.createEl("td", { cls: "loreline-grid-cell" });
      for (const event of row.cells.get(lane.id) ?? []) {
        renderEventCard(td, app, event);
      }
    }
  }
}
