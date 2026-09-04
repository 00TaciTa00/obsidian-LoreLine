import type { App } from "obsidian";

import type { EventItem } from "../lib/types";

/** 사건 카드에 쓸 색. 사건에 직접 적은 색이 기간 색보다 우선한다. */
export function eventColor(event: EventItem): string | null {
  return event.color ?? event.era?.color ?? null;
}

/** 카드에 접어 넣을 설명. 길면 잘라서 한 덩어리 크기를 맞춘다. */
function shortDescription(description: string | null): string | null {
  if (!description) return null;
  const oneLine = description.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;
  return oneLine.length > 120 ? `${oneLine.slice(0, 120)}…` : oneLine;
}

/**
 * 사건 하나를 카드로 그린다. 세 뷰가 모두 같은 카드를 쓴다.
 *
 * 읽기 전용이라 카드가 하는 일은 노트 열기 하나뿐이다.
 */
export function renderEventCard(
  parent: HTMLElement,
  app: App,
  event: EventItem,
  options: { showTime?: boolean } = {},
): HTMLElement {
  const card = parent.createDiv({ cls: "loreline-event" });

  const color = eventColor(event);
  if (color) card.style.setProperty("--loreline-event-color", color);

  card.createDiv({ cls: "loreline-event-title", text: event.title });

  if (options.showTime) {
    card.createDiv({ cls: "loreline-event-time", text: event.displayTime });
  }

  const description = shortDescription(event.description);
  if (description) {
    card.createDiv({ cls: "loreline-event-desc", text: description });
  }

  card.addEventListener("click", () => {
    void app.workspace.openLinkText(event.path, "", false);
  });

  return card;
}

/** 뷰에 보여줄 것이 없을 때의 안내 */
export function renderEmpty(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "loreline-empty", text: message });
}
