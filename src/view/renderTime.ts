import type { App } from "obsidian";

import { buildEraGroups } from "../lib/era-groups";
import type { LoreData } from "../lib/types";
import { asNoteLink, renderEmpty, renderEventCard } from "./shared";

/**
 * 시간별 뷰. sortKey 오름차순 사건을 "기간 → 작중 시각" 두 단계로 묶어 세로로
 * 늘어놓는다.
 *
 * 격자와 달리 가로축이 없다. 인물·공간을 지정하지 않은 사건도 여기서는 빠짐없이
 * 보인다.
 */
export function renderTime(container: HTMLElement, app: App, data: LoreData): void {
  if (data.events.length === 0) {
    renderEmpty(container, "사건 노트가 없다. frontmatter에 loreline: event 를 넣어 보라.");
    return;
  }

  const root = container.createDiv({ cls: "loreline-time" });

  for (const group of buildEraGroups(data.events, data.eras)) {
    const section = root.createDiv({ cls: "loreline-era" });

    const header = section.createDiv({ cls: "loreline-era-header" });
    if (group.color) header.style.setProperty("--loreline-era-color", group.color);
    const name = header.createSpan({ cls: "loreline-era-name", text: group.name });
    // 기간 노트가 있으면 머리글에서 바로 갈 수 있게 한다.
    if (group.path) asNoteLink(name, app, group.path, `${group.name} 기간 노트 열기`);
    header.createSpan({ cls: "loreline-era-count", text: `${group.eventCount}건` });

    if (group.times.length === 0) {
      // 만들어 두기만 하고 아직 사건이 없는 기간. 지우지 않고 남긴다.
      section.createDiv({ cls: "loreline-era-empty", text: "사건 없음" });
      continue;
    }

    for (const time of group.times) {
      const block = section.createDiv({ cls: "loreline-time-block" });
      block.createDiv({ cls: "loreline-time-label", text: time.displayTime });

      const list = block.createDiv({ cls: "loreline-time-events" });
      for (const event of time.events) {
        // 목록은 폭이 넉넉해 접지 않는다. 공간 먼저, 인물 다음.
        renderEventCard(list, app, event, {
          chips: { entities: [...event.places, ...event.characters] },
        });
      }
    }
  }
}
