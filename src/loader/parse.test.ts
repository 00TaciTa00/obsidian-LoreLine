import { describe, expect, it } from "vitest";

import {
  extractDescription,
  extractHeading,
  toNameList,
  toSortKey,
  toText,
} from "./parse";

describe("toNameList", () => {
  it("배열의 문자열만 남기고 앞뒤 공백을 정리한다", () => {
    expect(toNameList([" 아나이스 ", "지벨린"])).toEqual(["아나이스", "지벨린"]);
  });

  it("한 명만 적어 문자열로 들어와도 받아 준다", () => {
    expect(toNameList("아나이스")).toEqual(["아나이스"]);
  });

  it("같은 이름을 두 번 적어도 한 번만 센다", () => {
    expect(toNameList(["왕도", "왕도"])).toEqual(["왕도"]);
  });

  it("빈 이름과 문자열이 아닌 값은 버린다", () => {
    expect(toNameList(["", "  ", 3, null, "왕도"])).toEqual(["왕도"]);
  });

  it("값이 없으면 빈 목록이다", () => {
    expect(toNameList(undefined)).toEqual([]);
    expect(toNameList(null)).toEqual([]);
  });
});

describe("toText", () => {
  it("공백뿐인 값은 없는 것으로 본다", () => {
    expect(toText("   ")).toBeNull();
  });

  it("숫자로 적힌 연도도 문자열로 받는다", () => {
    // displayTime에 789를 따옴표 없이 적으면 YAML이 숫자로 준다.
    expect(toText(789)).toBe("789");
  });

  it("문자열도 숫자도 아니면 null이다", () => {
    expect(toText(["789년"])).toBeNull();
  });
});

describe("toSortKey", () => {
  it("숫자를 그대로 쓴다", () => {
    expect(toSortKey(3000)).toBe(3000);
  });

  it("따옴표로 감싼 숫자도 받는다", () => {
    expect(toSortKey(" 3000 ")).toBe(3000);
  });

  it("숫자가 아니면 null이다", () => {
    expect(toSortKey("셋째")).toBeNull();
    expect(toSortKey("")).toBeNull();
    expect(toSortKey(undefined)).toBeNull();
    expect(toSortKey(Number.NaN)).toBeNull();
  });
});

const NOTE = `---
loreline: event
displayTime: "789년"
---
# 왕도 함락

성문이 열렸다.

두 번째 문단.
`;

describe("extractDescription", () => {
  it("frontmatter와 맨 앞 제목을 걷어낸 나머지를 쓴다", () => {
    expect(extractDescription(NOTE)).toBe("성문이 열렸다.\n\n두 번째 문단.");
  });

  it("제목만 있고 본문이 없으면 null이다", () => {
    expect(extractDescription("---\nloreline: event\n---\n# 제목\n")).toBeNull();
  });

  it("frontmatter가 없어도 동작한다", () => {
    expect(extractDescription("본문뿐")).toBe("본문뿐");
  });

  it("본문 중간의 --- 는 frontmatter로 보지 않는다", () => {
    const note = "앞 문단\n\n---\n\n뒤 문단";
    expect(extractDescription(note)).toBe(note);
  });

  it("본문 안쪽 제목은 남긴다", () => {
    expect(extractDescription("첫 줄\n\n# 안쪽 제목")).toBe("첫 줄\n\n# 안쪽 제목");
  });
});

describe("extractHeading", () => {
  it("frontmatter 다음의 H1을 제목으로 쓴다", () => {
    expect(extractHeading(NOTE)).toBe("왕도 함락");
  });

  it("H1이 없으면 null이다 (파일명을 쓰라는 뜻)", () => {
    expect(extractHeading("---\nloreline: event\n---\n본문")).toBeNull();
  });

  it("H2는 제목이 아니다", () => {
    expect(extractHeading("## 소제목")).toBeNull();
  });
});
