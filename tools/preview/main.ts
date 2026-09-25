/**
 * 옵시디언 없이 뷰 세 개를 HTML 한 장으로 뽑는다.
 *
 * 실제 렌더러(renderTime/renderGrid)와 실제 styles.css를 그대로 쓰고, 데이터도
 * 진짜 볼트에서 읽는다. 다른 것은 옵시디언 테마 변수를 여기서 흉내 낸다는 점
 * 하나뿐이라, 색감은 쓰는 테마에 따라 조금 다를 수 있다.
 *
 *   node tools/preview/out.mjs "<볼트 경로>" "<대상 폴더>"
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import process from "node:process";

import type { App } from "obsidian";

import type { LoreData } from "../../src/lib/types";
import { parseConfig } from "../../src/loader/config";
import {
  extractDescription,
  extractHeading,
  toNameList,
  toSortKey,
  toText,
} from "../../src/loader/parse";
import { buildLoreData } from "../../src/loader/resolve";
import type { ScanResult } from "../../src/loader/scan";
import { renderGrid } from "../../src/view/renderGrid";
import { renderTime } from "../../src/view/renderTime";
import { FakeEl, fakeElement } from "../../src/testing/fake-dom";

const [vault, folder] = process.argv.slice(2);
const out = process.argv[4] ?? "preview.html";

// 볼트 경로는 기기마다 다르다. 기본값을 두면 없는 곳을 읽고 빈 화면을 낸다.
if (!vault || folder === undefined) {
  console.error('사용법: node tools/preview/out.mjs "<볼트 경로>" "<대상 폴더>" [출력.html]');
  process.exit(1);
}

/**
 * 옵시디언 metadataCache 대신 쓰는 최소 frontmatter 파서.
 * 미리보기용이라 샘플 노트가 쓰는 문법(스칼라, 대괄호 배열)만 안다.
 */
function frontmatterOf(text: string): Record<string, unknown> {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};

  const fields: Record<string, unknown> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^(\w+):\s*(.*)$/);
    if (!pair) continue;
    const raw = pair[2].trim();
    fields[pair[1]] = raw.startsWith("[")
      ? raw
          .slice(1, -1)
          .split(",")
          .map((item) => item.trim().replace(/^"|"$/g, ""))
          .filter(Boolean)
      : raw.replace(/^"|"$/g, "");
  }
  return fields;
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = `${dir}/${name}`;
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function scanFolder(): ScanResult {
  const result: ScanResult = {
    events: [],
    characters: [],
    places: [],
    eras: [],
    warnings: [],
  };

  for (const path of walk(`${vault}/${folder}`).filter((p) => p.endsWith(".md"))) {
    const content = readFileSync(path, "utf-8");
    const fields = frontmatterOf(content);
    const basename = path.split("/").at(-1)!.replace(/\.md$/, "");

    const kind = toText(fields.loreline);
    const note = { name: basename, path: path.slice(vault.length + 1) };
    if (kind === "character") {
      result.characters.push(note);
    } else if (kind === "place") {
      result.places.push(note);
    } else if (kind === "era") {
      result.eras.push(note);
    } else if (kind === "event") {
      const displayTime = toText(fields.displayTime);
      if (!displayTime) continue;
      result.events.push({
        path: path.slice(vault.length + 1),
        title: extractHeading(content) ?? basename,
        description: extractDescription(content),
        displayTime,
        sortKey: toSortKey(fields.sortKey) ?? Number.MAX_SAFE_INTEGER,
        eraName: toText(fields.era),
        characterNames: toNameList(fields.characters),
        placeNames: toNameList(fields.places),
        color: toText(fields.color),
      });
    }
  }
  return result;
}

/** 렌더러는 클릭 핸들러에서만 app을 쓰므로 미리보기에서는 빈 껍데기면 된다. */
const app = {} as App;

function renderPane(data: LoreData, mode: "all" | "place" | "character"): string {
  const body = fakeElement("div") as unknown as HTMLElement;
  if (mode === "all") {
    renderTime(body, app, data);
  } else {
    // 미리보기는 정지 화면이라 필터는 그려만 두고 아무것도 감추지 않는다.
    renderGrid(body, app, data, mode, {
      hidden: new Set<string>(),
      onToggle: () => {},
      onShowAll: () => {},
    });
  }
  return (body as unknown as FakeEl).toHtml(3);
}

const scan = scanFolder();
const { config } = parseConfig(readFileSync(`${vault}/${folder}/loreline.config.json`, "utf-8"));
const data = buildLoreData(scan, config);

const styles = readFileSync("styles.css", "utf-8");
const themeVars = readFileSync("tools/preview/theme.css", "utf-8");

const PANES: { mode: "all" | "place" | "character"; label: string }[] = [
  { mode: "all", label: "시간별" },
  { mode: "place", label: "공간별" },
  { mode: "character", label: "인물별" },
];

function page(panes: typeof PANES): string {
  const sections = panes
    .map(
      ({ mode, label }) => `    <section class="preview-pane">
      <h2 class="preview-caption">${label}</h2>
      <div class="loreline-view">
        <div class="loreline-toolbar">
          <div class="loreline-toggle">
${PANES.map(
  (pane) =>
    `            <button class="loreline-toggle-button${pane.mode === mode ? " is-active" : ""}">${pane.label}</button>`,
).join("\n")}
          </div>
          <button class="loreline-refresh">다시 읽기</button>
        </div>
        <div class="loreline-body">
${renderPane(data, mode)}
        </div>
      </div>
    </section>`,
    )
    .join("\n");

  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<title>LoreLine 미리보기 — ${folder}</title>
<style>
${themeVars}
${styles}
</style>
</head>
<body class="theme-dark">
<main class="preview-root">
${sections}
</main>
</body>
</html>
`;
}

writeFileSync(out, page(PANES), "utf-8");
// 뷰 하나만 담은 페이지도 같이 낸다. 좁은 창에서 한 뷰씩 볼 때 쓴다.
for (const pane of PANES) {
  writeFileSync(out.replace(/\.html$/, `-${pane.mode}.html`), page([pane]), "utf-8");
}

console.log(
  `${out} — 사건 ${data.events.length}건, 인물 ${data.characters.length}, 장소 ${data.places.length}, 기간 ${data.eras.length}`,
);
