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

/** 칩으로 보여줄 딸린 공간·인물 */
export type ChipEntity = { name: string; color: string };

/**
 * 카드의 칩 줄을 어떻게 그릴지.
 *
 * 격자 열은 좁아서 칩을 다 펼치면 카드 높이가 들쭉날쭉해진다. `limit`을 넘는
 * 만큼은 접어 두고 버튼으로 펼친다. 펼침 상태는 뷰가 들고 있어야 다시 그려도
 * 유지된다.
 */
export type ChipOptions = {
  entities: ChipEntity[];
  /** 접었을 때 보일 최대 개수. 없으면 다 보인다. */
  limit?: number;
  expanded?: boolean;
  onToggle?: () => void;
};

/**
 * 딸린 공간·인물 칩 줄 (원본 EntityChip, 92e3654).
 *
 * 칩은 누를 수 없다. 카드 전체가 이미 노트로 가는 링크라, 칩까지 링크로 두면
 * 무엇이 열릴지 헷갈린다.
 */
function renderChips(card: HTMLElement, options: ChipOptions): void {
  const { entities, limit, expanded = false, onToggle } = options;
  if (entities.length === 0) return;

  const hiddenCount = limit === undefined ? 0 : Math.max(0, entities.length - limit);
  const shown = expanded || limit === undefined ? entities : entities.slice(0, limit);

  const row = card.createDiv({ cls: "loreline-tags" });
  for (const entity of shown) {
    const tag = row.createSpan({ cls: "loreline-tag" });
    tag.setAttribute("title", entity.name);
    tag.style.setProperty("--loreline-tag-color", entity.color);
    tag.createSpan({ cls: "loreline-tag-dot" });
    tag.createSpan({ cls: "loreline-tag-name", text: entity.name });
  }

  // 접힌 개수가 0이면 버튼을 두지 않는다. 펼쳐 둔 사이에 딸린 항목이 줄면
  // "-0"이 남기 때문이다. 버튼이 사라져도 칩은 모두 보이는 상태라 갇히지 않는다.
  if (hiddenCount === 0 || !onToggle) return;

  // 글자는 부호와 개수만. "접기"는 칩 한 개 자리를 잡아먹는다. 개수를 붙여
  // 두면 접은 뒤 몇 개가 숨는지 미리 보인다. 낭독기에는 이름을 따로 준다.
  const more = row.createEl("button", {
    cls: "loreline-tag-more",
    text: expanded ? `-${hiddenCount}` : `+${hiddenCount}`,
  });
  more.setAttribute("aria-expanded", String(expanded));
  more.setAttribute("aria-label", expanded ? `${hiddenCount}개 접기` : `${hiddenCount}개 더 보기`);

  // 카드가 링크라 이벤트가 번지면 노트가 같이 열린다.
  more.addEventListener("click", (source) => {
    source.stopPropagation();
    onToggle();
  });
  more.addEventListener("keydown", (source) => source.stopPropagation());
}

/**
 * 사건 하나를 카드로 그린다. 세 뷰가 모두 같은 카드를 쓴다.
 *
 * 카드의 색 띠가 맥락을 말한다(원본 c6a8456). 사건마다 따로 색을 주던 것은
 * 기간·공간과 뜻이 겹쳐 없앴다.
 * - 왼쪽 띠: 그 사건의 기간 색. 기간이 없으면 띠 자리만 남는다
 * - 위쪽 띠: 격자에서만. 카드가 덮는 열마다 한 칸씩, 그 사건이 실제로 걸린
 *   열에만 색을 찍는다(원본 432028c). 사이에 낀 열은 옅은 바탕만 남겨, 띠가
 *   끊긴 별개의 막대가 아니라 한 장이라는 것이 읽히게 한다. 시간별 목록은
 *   열이 없으므로 두지 않는다
 *
 * 읽기 전용이라 카드가 하는 일은 노트 열기 하나뿐이다.
 */
export function renderEventCard(
  parent: HTMLElement,
  app: App,
  event: EventItem,
  options: {
    /** 카드가 덮는 열의 색. 걸리지 않은 열은 null. 격자에서만 준다. */
    lanes?: (string | null)[];
    chips?: ChipOptions;
  } = {},
): HTMLElement {
  const card = parent.createDiv({ cls: "loreline-event" });

  if (event.era) card.style.setProperty("--loreline-card-era", event.era.color);
  if (options.lanes && options.lanes.length > 0) {
    card.addClass("has-lanes");
    const band = card.createDiv({ cls: "loreline-event-lanes" });
    band.setAttribute("aria-hidden", "true");
    for (const color of options.lanes) {
      const segment = band.createSpan({ cls: "loreline-event-lane" });
      if (color) segment.style.setProperty("--loreline-card-lane", color);
    }
  }

  card.createDiv({ cls: "loreline-event-title", text: event.title });

  const description = shortDescription(event.description);
  if (description) {
    card.createDiv({ cls: "loreline-event-desc", text: description });
  }

  if (options.chips) renderChips(card, options.chips);

  asNoteLink(card, app, event.path, `${event.title} — ${event.displayTime}`);

  return card;
}

/** 뷰에 보여줄 것이 없을 때의 안내 */
export function renderEmpty(parent: HTMLElement, message: string): void {
  parent.createDiv({ cls: "loreline-empty", text: message });
}
