import type { App } from "obsidian";
import { describe, expect, it, vi } from "vitest";

import type { Character, Era, EventItem, LoreData, Place } from "../lib/types";
import { FakeEl, fakeElement } from "../testing/fake-dom";
import { renderGrid, type GridOptions } from "./renderGrid";
import { renderTime } from "./renderTime";
import { renderEventCard } from "./shared";

function era(name: string, color = "#a855f7", order = 10, path: string | null = null): Era {
  return { id: name, name, color, order, path };
}
function place(name: string, color = "#22c55e", order = 10, path: string | null = null): Place {
  return { id: name, name, color, order, path };
}
function character(
  name: string,
  color = "#3b82f6",
  order = 10,
  path: string | null = null,
): Character {
  return { id: name, name, color, order, path };
}

function ev(partial: Partial<EventItem> & { title: string }): EventItem {
  return {
    id: `${partial.title}.md`,
    path: `${partial.title}.md`,
    description: null,
    era: null,
    displayTime: "1년",
    sortKey: 1000,
    color: null,
    places: [],
    characters: [],
    ...partial,
  };
}

function data(partial: Partial<LoreData> = {}): LoreData {
  return {
    events: [],
    places: [],
    characters: [],
    eras: [],
    warnings: [],
    ...partial,
  };
}

/** 렌더러가 받는 HTMLElement 자리에 가짜 요소를 끼운다. */
function root(): { el: HTMLElement; fake: FakeEl } {
  const fake = fakeElement("div");
  return { el: fake as unknown as HTMLElement, fake };
}

function fakeApp(openLinkText = vi.fn()): App {
  return { workspace: { openLinkText } } as unknown as App;
}

const GRID_OPTIONS: GridOptions = {
  hidden: new Set<string>(),
  onToggle: () => {},
  onShowAll: () => {},
};

describe("renderEventCard", () => {
  it("제목과 설명을 담고 노트로 가는 링크가 된다", () => {
    const { el, fake } = root();
    renderEventCard(el, fakeApp(), ev({ title: "왕도 함락", description: "성문이 열렸다." }));

    const card = fake.query("loreline-event")!;
    expect(card.query("loreline-event-title")?.text).toBe("왕도 함락");
    expect(card.query("loreline-event-desc")?.text).toBe("성문이 열렸다.");
    expect(card.attr("role")).toBe("link");
    expect(card.attr("tabindex")).toBe("0");
    expect(card.attr("aria-label")).toContain("왕도 함락");
  });

  it("사건 색이 기간 색보다 앞선다", () => {
    const { el, fake } = root();
    renderEventCard(
      el,
      fakeApp(),
      ev({ title: "a", color: "#ff0000", era: era("제3 성력", "#00ff00") }),
    );
    expect(fake.query("loreline-event")?.cssVar("--loreline-event-color")).toBe("#ff0000");
  });

  it("사건에 색이 없으면 기간 색을 쓴다", () => {
    const { el, fake } = root();
    renderEventCard(el, fakeApp(), ev({ title: "a", era: era("제3 성력", "#00ff00") }));
    expect(fake.query("loreline-event")?.cssVar("--loreline-event-color")).toBe("#00ff00");
  });

  it("클릭하면 그 노트를 연다", () => {
    const open = vi.fn();
    const { el, fake } = root();
    renderEventCard(el, fakeApp(open), ev({ title: "함락" }));

    fake.query("loreline-event")!.dispatch("click");

    expect(open).toHaveBeenCalledWith("함락.md", "", false);
  });

  it("가운데 클릭은 언제나 새 탭이다", () => {
    const open = vi.fn();
    const { el, fake } = root();
    renderEventCard(el, fakeApp(open), ev({ title: "함락" }));

    fake.query("loreline-event")!.dispatch("auxclick", { button: 1 });

    expect(open).toHaveBeenCalledWith("함락.md", "", "tab");
  });

  it("가운데가 아닌 보조 버튼은 아무 일도 하지 않는다", () => {
    const open = vi.fn();
    const { el, fake } = root();
    renderEventCard(el, fakeApp(open), ev({ title: "함락" }));

    fake.query("loreline-event")!.dispatch("auxclick", { button: 2 });

    expect(open).not.toHaveBeenCalled();
  });

  it("Enter로도 열린다", () => {
    const open = vi.fn();
    const { el, fake } = root();
    renderEventCard(el, fakeApp(open), ev({ title: "함락" }));

    fake.query("loreline-event")!.dispatch("keydown", { key: "Enter" });

    expect(open).toHaveBeenCalledTimes(1);
  });

  it("다른 키에는 반응하지 않는다", () => {
    const open = vi.fn();
    const { el, fake } = root();
    renderEventCard(el, fakeApp(open), ev({ title: "함락" }));

    fake.query("loreline-event")!.dispatch("keydown", { key: "a" });

    expect(open).not.toHaveBeenCalled();
  });

  it("긴 설명은 글자 수로 자른다", () => {
    // slice로 자르면 이모지가 반쪽 나 깨진 글자가 보인다.
    const { el, fake } = root();
    const description = "🌊".repeat(200);
    renderEventCard(el, fakeApp(), ev({ title: "a", description }));

    const text = fake.query("loreline-event-desc")!.text;
    expect([...text]).toHaveLength(121);
    expect(text.endsWith("…")).toBe(true);
    expect(text).not.toContain("�");
  });
});

describe("renderTime", () => {
  const third = era("제3 성력", "#a855f7", 10);
  const fourth = era("제4 성력", "#3b82f6", 20);

  it("기간 순서대로 구획을 만들고 건수를 적는다", () => {
    const { el, fake } = root();
    renderTime(
      el,
      fakeApp(),
      data({
        eras: [third, fourth],
        events: [
          ev({ title: "건국", era: third, sortKey: 1000 }),
          ev({ title: "즉위", era: third, sortKey: 2000 }),
          ev({ title: "전쟁", era: fourth, sortKey: 3000 }),
        ],
      }),
    );

    expect(fake.queryAll("loreline-era-name").map((e) => e.text)).toEqual([
      "제3 성력",
      "제4 성력",
    ]);
    expect(fake.queryAll("loreline-era-count").map((e) => e.text)).toEqual(["2건", "1건"]);
    expect(fake.queryAll("loreline-event")).toHaveLength(3);
  });

  it("기간 색을 머리글에 싣는다", () => {
    const { el, fake } = root();
    renderTime(el, fakeApp(), data({ eras: [third], events: [ev({ title: "a", era: third })] }));

    expect(fake.query("loreline-era-header")?.cssVar("--loreline-era-color")).toBe("#a855f7");
  });

  it("사건이 없는 기간도 남긴다", () => {
    const { el, fake } = root();
    renderTime(
      el,
      fakeApp(),
      data({ eras: [third, fourth], events: [ev({ title: "a", era: third })] }),
    );

    expect(fake.query("loreline-era-empty")?.text).toBe("사건 없음");
  });

  it("사건이 하나도 없으면 안내만 띄운다", () => {
    const { el, fake } = root();
    renderTime(el, fakeApp(), data());

    expect(fake.query("loreline-empty")?.text).toContain("loreline: event");
    expect(fake.queryAll("loreline-era")).toHaveLength(0);
  });
});

describe("renderGrid", () => {
  const palace = place("왕도", "#22c55e", 10);
  const forest = place("숲", "#f97316", 20);
  const anais = character("아나이스");

  const WORLD = data({
    places: [palace, forest],
    characters: [anais],
    events: [
      ev({ title: "함락", displayTime: "1년", sortKey: 1000, places: [palace] }),
      ev({ title: "회담", displayTime: "1년", sortKey: 2000, places: [forest] }),
      ev({ title: "추격", displayTime: "2년", sortKey: 3000, places: [forest] }),
    ],
  });

  it("공간마다 열을 세우고 색과 건수를 붙인다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", GRID_OPTIONS);

    const lanes = fake.queryAll("loreline-grid-lane");
    expect(lanes.map((l) => l.query("loreline-lane-name")?.text)).toEqual(["왕도", "숲"]);
    expect(lanes.map((l) => l.query("loreline-lane-count")?.text)).toEqual(["1", "2"]);
    expect(lanes[0].cssVar("--loreline-lane-color")).toBe("#22c55e");
  });

  it("같은 작중 시각은 한 행으로 묶는다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", GRID_OPTIONS);

    expect(fake.queryAll("loreline-grid-time").map((t) => t.text)).toEqual(["1년", "2년"]);
  });

  it("감춘 열은 표에서 빠지고 칩에는 남는다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", { ...GRID_OPTIONS, hidden: new Set(["place-숲"]) });

    expect(
      fake.queryAll("loreline-grid-lane").map((l) => l.query("loreline-lane-name")?.text),
    ).toEqual(["왕도"]);
    // 사라지면 다시 켤 수가 없다.
    expect(fake.queryAll("loreline-chip")).toHaveLength(2);
    expect(fake.queryAll("loreline-chip").filter((c) => c.hasClass("is-off"))).toHaveLength(1);
  });

  it("모두 보기는 감춘 것이 있을 때만 나온다", () => {
    const { el: bare, fake: bareFake } = root();
    renderGrid(bare, fakeApp(), WORLD, "place", GRID_OPTIONS);
    expect(bareFake.query("loreline-chip-all")).toBeUndefined();

    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", { ...GRID_OPTIONS, hidden: new Set(["place-숲"]) });
    expect(fake.query("loreline-chip-all")?.text).toBe("모두 보기");
  });

  it("칩을 누르면 그 열의 id를 알려 준다", () => {
    const onToggle = vi.fn();
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", { ...GRID_OPTIONS, onToggle });

    fake.queryAll("loreline-chip")[1].dispatch("click");

    expect(onToggle).toHaveBeenCalledWith("place-숲");
  });

  it("모두 감추면 표 대신 안내를 띄운다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "place", {
      ...GRID_OPTIONS,
      hidden: new Set(["place-왕도", "place-숲"]),
    });

    expect(fake.queryAllTags("table")).toHaveLength(0);
    expect(fake.query("loreline-empty")?.text).toContain("다시 켜라");
    // 칩은 남아 있어야 되돌릴 수 있다.
    expect(fake.queryAll("loreline-chip")).toHaveLength(2);
  });

  it("그 축의 노트가 없으면 필터도 표도 만들지 않는다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), data({ events: WORLD.events }), "character", GRID_OPTIONS);

    expect(fake.query("loreline-filter")).toBeUndefined();
    expect(fake.query("loreline-empty")?.text).toContain("loreline: character");
  });

  it("인물축은 인물로 열을 세운다", () => {
    const { el, fake } = root();
    renderGrid(el, fakeApp(), WORLD, "character", GRID_OPTIONS);

    expect(
      fake.queryAll("loreline-grid-lane").map((l) => l.query("loreline-lane-name")?.text),
    ).toEqual(["아나이스"]);
    // 아무 사건도 인물을 달지 않았다.
    expect(fake.query("loreline-empty")?.text).toContain("켜 둔 인물");
  });
});

describe("renderGrid - 시간 칸", () => {
  const palace = place("왕도");
  const third = era("제3 성력", "#a855f7");

  it("기간과 시각을 두 줄로 나눈다", () => {
    const { el, fake } = root();
    renderGrid(
      el,
      fakeApp(),
      data({
        places: [palace],
        events: [ev({ title: "함락", displayTime: "789년", era: third, places: [palace] })],
      }),
      "place",
      GRID_OPTIONS,
    );

    expect(fake.query("loreline-grid-era")?.text).toBe("제3 성력");
    expect(fake.query("loreline-grid-hour")?.text).toBe("789년");
    // ":"는 구분 기호라 CSS가 붙인다. 글자로 섞이지 않는다.
    expect(fake.query("loreline-grid-hour")?.text).not.toContain(":");
  });

  it("기간이 없으면 시각 한 줄뿐이다", () => {
    const { el, fake } = root();
    renderGrid(
      el,
      fakeApp(),
      data({
        places: [palace],
        events: [ev({ title: "함락", displayTime: "789년", places: [palace] })],
      }),
      "place",
      GRID_OPTIONS,
    );

    expect(fake.query("loreline-grid-era")).toBeUndefined();
    // 앞에 붙일 것이 없다는 표시.
    expect(fake.query("loreline-grid-hour")?.hasClass("is-alone")).toBe(true);
  });

  it("기간 색은 칸에 그대로 실린다", () => {
    const { el, fake } = root();
    renderGrid(
      el,
      fakeApp(),
      data({
        places: [palace],
        events: [ev({ title: "함락", era: third, places: [palace] })],
      }),
      "place",
      GRID_OPTIONS,
    );

    expect(fake.query("loreline-grid-time")?.cssVar("--loreline-era-color")).toBe("#a855f7");
  });
});

describe("이름을 눌러 문서로", () => {
  it("노트가 있는 열은 이름이 링크가 된다", () => {
    const open = vi.fn();
    const palace = place("왕도", "#22c55e", 10, "장소/왕도.md");
    const { el, fake } = root();

    renderGrid(el, fakeApp(open), data({ places: [palace] }), "place", GRID_OPTIONS);

    const label = fake.query("loreline-lane-name")!;
    expect(label.attr("role")).toBe("link");
    expect(label.attr("tabindex")).toBe("0");

    label.dispatch("click");
    expect(open).toHaveBeenCalledWith("장소/왕도.md", "", false);
  });

  it("노트가 없는 열은 누를 것이 없다", () => {
    // 정의 파일에만 적힌 이름은 갈 곳이 없다.
    const { el, fake } = root();

    renderGrid(el, fakeApp(), data({ places: [place("왕도")] }), "place", GRID_OPTIONS);

    const label = fake.query("loreline-lane-name")!;
    expect(label.attr("role")).toBeUndefined();
    expect(label.listensTo("click")).toBe(false);
  });

  it("격자의 기간 이름도 링크가 된다", () => {
    const open = vi.fn();
    const palace = place("왕도");
    const third = era("제3 성력", "#a855f7", 10, "기간/제3 성력.md");
    const { el, fake } = root();

    renderGrid(
      el,
      fakeApp(open),
      data({ places: [palace], events: [ev({ title: "함락", era: third, places: [palace] })] }),
      "place",
      GRID_OPTIONS,
    );

    fake.query("loreline-grid-era")!.dispatch("click");
    expect(open).toHaveBeenCalledWith("기간/제3 성력.md", "", false);
  });

  it("시간별 뷰의 기간 머리글도 링크가 된다", () => {
    const open = vi.fn();
    const third = era("제3 성력", "#a855f7", 10, "기간/제3 성력.md");
    const { el, fake } = root();

    renderTime(el, fakeApp(open), data({ eras: [third], events: [ev({ title: "a", era: third })] }));

    fake.query("loreline-era-name")!.dispatch("click");
    expect(open).toHaveBeenCalledWith("기간/제3 성력.md", "", false);
  });

  it("노트가 없는 기간 머리글은 누를 것이 없다", () => {
    const third = era("제3 성력");
    const { el, fake } = root();

    renderTime(el, fakeApp(), data({ eras: [third], events: [ev({ title: "a", era: third })] }));

    expect(fake.query("loreline-era-name")?.listensTo("click")).toBe(false);
  });

  it("열 이름도 가운데 클릭이면 새 탭이다", () => {
    const open = vi.fn();
    const palace = place("왕도", "#22c55e", 10, "장소/왕도.md");
    const { el, fake } = root();

    renderGrid(el, fakeApp(open), data({ places: [palace] }), "place", GRID_OPTIONS);
    fake.query("loreline-lane-name")!.dispatch("auxclick", { button: 1 });

    expect(open).toHaveBeenCalledWith("장소/왕도.md", "", "tab");
  });

  it("열 건수는 누르는 곳이 아니다", () => {
    // 숫자는 곁들인 정보지 링크가 아니다.
    const palace = place("왕도", "#22c55e", 10, "장소/왕도.md");
    const { el, fake } = root();

    renderGrid(el, fakeApp(), data({ places: [palace] }), "place", GRID_OPTIONS);

    expect(fake.query("loreline-lane-count")?.listensTo("click")).toBe(false);
  });
});
