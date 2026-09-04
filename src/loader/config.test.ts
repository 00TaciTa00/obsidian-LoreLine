import { describe, expect, it } from "vitest";

import { parseConfig } from "./config";

describe("parseConfig", () => {
  it("색과 순서를 읽는다", () => {
    const { config, warnings } = parseConfig(
      JSON.stringify({
        characters: [{ name: "아나이스", color: "#3b82f6", order: 10 }],
        places: [{ name: "왕도", color: "#22c55e", order: 10 }],
        eras: [{ name: "제3 성력", color: "#a855f7", order: 10 }],
      }),
    );

    expect(warnings).toEqual([]);
    expect(config.characters[0]).toEqual({
      name: "아나이스",
      color: "#3b82f6",
      order: 10,
    });
    expect(config.places).toHaveLength(1);
    expect(config.eras).toHaveLength(1);
  });

  it("없는 구획은 빈 목록으로 채운다", () => {
    const { config } = parseConfig(JSON.stringify({ characters: [] }));
    expect(config.places).toEqual([]);
    expect(config.eras).toEqual([]);
  });

  it("JSON이 깨졌으면 빈 설정과 경고를 준다", () => {
    const { config, warnings } = parseConfig("{ 이건 JSON이 아니다");
    expect(config.characters).toEqual([]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("JSON 오류");
  });

  it("최상위가 배열이면 설정으로 보지 않는다", () => {
    const { warnings } = parseConfig("[]");
    expect(warnings).toHaveLength(1);
  });

  it("name이 없는 항목은 버리고 경고한다", () => {
    const { config, warnings } = parseConfig(
      JSON.stringify({ places: [{ color: "#fff" }, { name: "왕도" }] }),
    );
    expect(config.places.map((p) => p.name)).toEqual(["왕도"]);
    expect(warnings).toHaveLength(1);
  });

  it("색·순서를 안 적어도 이름만으로 받는다", () => {
    const { config } = parseConfig(JSON.stringify({ places: [{ name: "왕도" }] }));
    expect(config.places[0]).toEqual({ name: "왕도", color: undefined, order: undefined });
  });

  it("구획이 배열이 아니면 무시하고 경고한다", () => {
    const { config, warnings } = parseConfig(JSON.stringify({ places: "왕도" }));
    expect(config.places).toEqual([]);
    expect(warnings).toHaveLength(1);
  });
});
