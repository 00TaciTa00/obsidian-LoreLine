import { Keymap, type App, type UserEvent } from "obsidian";

import type { EventItem } from "../lib/types";

/** 사건 카드에 쓸 색. 사건에 직접 적은 색이 기간 색보다 우선한다. */
function eventColor(event: EventItem): string | null {
  return event.color ?? event.era?.color ?? null;
}

/** 카드에 접어 넣을 설명의 최대 길이 (글자 수) */
const DESCRIPTION_LIMIT = 120;

/**
 * 카드에 접어 넣을 설명. 길면 잘라서 한 덩어리 크기를 맞춘다.
 *
 * slice가 아니라 코드포인트 단위로 센다. 이모지처럼 두 칸을 차지하는 글자를
 * slice로 자르면 반쪽이 남아 깨진 글자가 보인다.
 */
function shortDescription(description: string | null): string | null {
  if (!description) return null;

  const oneLine = description.replace(/\s+/g, " ").trim();
  if (!oneLine) return null;

  const letters = [...oneLine];
  return letters.length > DESCRIPTION_LIMIT
    ? `${letters.slice(0, DESCRIPTION_LIMIT).join("")}…`
    : oneLine;
}

/**
 * 사건 하나를 카드로 그린다. 세 뷰가 모두 같은 카드를 쓴다.
 *
 * 읽기 전용이라 카드가 하는 일은 노트 열기 하나뿐이다.
 */
export function renderEventCard(parent: HTMLElement, app: App, event: EventItem): HTMLElement {
  const card = parent.createDiv({ cls: "loreline-event" });

  const color = eventColor(event);
  if (color) card.style.setProperty("--loreline-event-color", color);

  card.createDiv({ cls: "loreline-event-title", text: event.title });

  const description = shortDescription(event.description);
  if (description) {
    card.createDiv({ cls: "loreline-event-desc", text: description });
  }

  // 카드는 노트로 가는 링크다. 마우스만 쓰는 사람도, 키보드만 쓰는 사람도
  // 같은 곳에 닿아야 한다.
  card.setAttribute("role", "link");
  card.setAttribute("tabindex", "0");
  card.setAttribute("aria-label", `${event.title} — ${event.displayTime}`);

  // Ctrl/Cmd를 누른 클릭이면 새 탭. 옵시디언의 링크와 같게 둔다.
  const open = (source: UserEvent) => {
    void app.workspace.openLinkText(event.path, "", Keymap.isModEvent(source));
  };

  card.addEventListener("click", open);
  card.addEventListener("auxclick", (source) => {
    // 가운데 클릭은 보조 키와 상관없이 언제나 새 탭이다. isModEvent에 맡기면
    // Ctrl을 같이 누르지 않은 가운데 클릭이 같은 탭에서 열려 버린다.
    if (source.button !== 1) return;
    source.preventDefault();
    void app.workspace.openLinkText(event.path, "", "tab");
  });
  card.addEventListener("keydown", (source) => {
    if (source.key !== "Enter" && source.key !== " ") return;
    // 스페이스로 페이지가 스크롤되지 않게 한다.
    source.preventDefault();
    open(source);
  });

  return card;
}

/** 뷰에 보여줄 것이 없을 때의 안내 */
export function renderEmpty(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "loreline-empty", text: message });
}
