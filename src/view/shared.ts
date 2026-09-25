import { Keymap, type App, type UserEvent } from "obsidian";

import type { EventItem } from "../lib/types";

/**
 * 이 요소를 눌러 그 노트로 가게 한다.
 *
 * 사건 카드, 격자의 열 이름, 기간 이름이 모두 같은 방식으로 열려야 한다.
 * 마우스만 쓰는 사람도 키보드만 쓰는 사람도 같은 곳에 닿는다.
 */
export function asNoteLink(
  el: HTMLElement,
  app: App,
  path: string,
  label: string,
): void {
  el.addClass("loreline-link");
  el.setAttribute("role", "link");
  el.setAttribute("tabindex", "0");
  el.setAttribute("aria-label", label);

  // Ctrl/Cmd를 누른 클릭이면 새 탭. 옵시디언의 링크와 같게 둔다.
  const open = (source: UserEvent) => {
    void app.workspace.openLinkText(path, "", Keymap.isModEvent(source));
  };

  el.addEventListener("click", open);
  el.addEventListener("auxclick", (source) => {
    // 가운데 클릭은 보조 키와 상관없이 언제나 새 탭이다. isModEvent에 맡기면
    // Ctrl을 같이 누르지 않은 가운데 클릭이 같은 탭에서 열려 버린다.
    if (source.button !== 1) return;
    source.preventDefault();
    void app.workspace.openLinkText(path, "", "tab");
  });
  el.addEventListener("keydown", (source) => {
    if (source.key !== "Enter" && source.key !== " ") return;
    // 스페이스로 페이지가 스크롤되지 않게 한다.
    source.preventDefault();
    open(source);
  });
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
 * 카드의 색 띠가 맥락을 말한다(원본 c6a8456). 사건마다 따로 색을 주던 것은
 * 기간·공간과 뜻이 겹쳐 없앴다.
 * - 왼쪽 띠: 그 사건의 기간 색. 기간이 없으면 띠 자리만 남는다
 * - 위쪽 띠: 격자에서만, 그 카드가 놓인 열(공간·인물)의 색. 시간별 목록은 열이
 *   없으므로 두지 않는다
 *
 * 읽기 전용이라 카드가 하는 일은 노트 열기 하나뿐이다.
 */
export function renderEventCard(
  parent: HTMLElement,
  app: App,
  event: EventItem,
  options: { laneColor?: string } = {},
): HTMLElement {
  const card = parent.createDiv({ cls: "loreline-event" });

  if (event.era) card.style.setProperty("--loreline-card-era", event.era.color);
  if (options.laneColor) {
    card.addClass("has-lane");
    card.style.setProperty("--loreline-card-lane", options.laneColor);
  }

  card.createDiv({ cls: "loreline-event-title", text: event.title });

  const description = shortDescription(event.description);
  if (description) {
    card.createDiv({ cls: "loreline-event-desc", text: description });
  }

  asNoteLink(card, app, event.path, `${event.title} — ${event.displayTime}`);

  return card;
}

/** 뷰에 보여줄 것이 없을 때의 안내 */
export function renderEmpty(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "loreline-empty", text: message });
}
