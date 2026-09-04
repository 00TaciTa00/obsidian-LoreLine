/**
 * 노트 한 장에서 값을 뽑는 순수 함수들. 옵시디언 API에 기대지 않으므로
 * 단위 테스트 대상이다. 실제 파일 읽기는 scan.ts가 맡는다.
 */

/** frontmatter에서 읽어낸, 아직 해소(resolve) 전인 사건 */
export type RawEvent = {
  /** 볼트 경로 */
  path: string;
  title: string;
  description: string | null;
  displayTime: string;
  sortKey: number;
  /** Era 이름. 없으면 null */
  eraName: string | null;
  characterNames: string[];
  placeNames: string[];
  color: string | null;
};

/** frontmatter 값 하나를 문자열 배열로 본다. 단일 문자열도 한 칸짜리로 받는다. */
export function toNameList(value: unknown): string[] {
  if (typeof value === "string") {
    const name = value.trim();
    return name ? [name] : [];
  }
  if (!Array.isArray(value)) return [];

  const names: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const name = item.trim();
    // 같은 이름을 두 번 적어도 칸에 두 번 들어가지 않게 한다.
    if (name && !names.includes(name)) names.push(name);
  }
  return names;
}

/** frontmatter의 문자열 값. 비어 있으면 null. */
export function toText(value: unknown): string | null {
  if (typeof value === "string") {
    const text = value.trim();
    return text ? text : null;
  }
  if (typeof value === "number") return String(value);
  return null;
}

/**
 * 정렬값. 숫자가 아니면 null이다.
 *
 * 읽기 전용이라 채번은 하지 않는다. 값이 없는 사건은 호출하는 쪽에서 맨 뒤로
 * 보낸다.
 */
export function toSortKey(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed) && value.trim() !== "") return parsed;
  }
  return null;
}

/**
 * 본문에서 사건 설명을 뽑는다.
 *
 * frontmatter 블록과 맨 앞 H1(제목으로 이미 쓰였다)을 걷어낸 나머지다.
 * 비어 있으면 null.
 */
export function extractDescription(content: string): string | null {
  let body = content.replace(/^﻿/, "");

  // 파일 맨 앞의 --- ... --- 한 덩어리만 걷어낸다.
  const frontmatter = /^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/;
  body = body.replace(frontmatter, "");

  // 맨 앞 H1은 제목이므로 설명에서 뺀다.
  body = body.replace(/^\s*#[ \t]+[^\n]*(\r?\n|$)/, "");

  const trimmed = body.trim();
  return trimmed ? trimmed : null;
}

/** 본문 맨 앞 H1. 없으면 null. 파일명보다 우선한다. */
export function extractHeading(content: string): string | null {
  const body = content.replace(/^﻿/, "").replace(/^---\r?\n[\s\S]*?\r?\n---[ \t]*(\r?\n|$)/, "");
  const match = body.match(/^\s*#[ \t]+([^\n]+)/);
  if (!match) return null;
  const heading = match[1].trim();
  return heading ? heading : null;
}
