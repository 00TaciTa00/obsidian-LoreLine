/**
 * 원본 LoreLine 웹앱에 들어온 새 커밋을 훑어, 플러그인에 반영할 것을 가려낸다.
 *
 *   npm run upstream              # UPSTREAM.md의 "검토 완료" 뒤 커밋만
 *   npm run upstream -- <커밋>    # 그 커밋 뒤부터
 *   npm run upstream -- --json    # 기계용. GitHub 워크플로가 이슈 본문을 여기서 얻는다
 *
 * 원본 clone 위치는 LORELINE_UPSTREAM 환경변수, 없으면 이 레포의 형제 폴더
 * ../loreline 이다. 스크립트가 origin을 fetch하지만 원본 작업 트리는 건드리지
 * 않는다(origin/main을 기준으로 본다).
 *
 * 원본 파일을 세 부류로 나눈다. 플러그인은 읽기 전용이라 편집·서버·DB 쪽은
 * 대응하는 코드가 없다.
 *   반영 — 플러그인에 짝이 있다. 커밋을 읽고 옮길지 정한다
 *   참고 — 문서. 설계 결정이 바뀌었을 수 있다
 *   무시 — 짝이 없다
 * 원본이 .git-blame-ignore-revs에 올린 커밋(일괄 서식 정리)은 "서식"으로 따로 뺀다.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

const LEDGER = "UPSTREAM.md";
const upstream = resolve(process.env.LORELINE_UPSTREAM ?? "../loreline");

/** [원본 경로 정규식, 부류, 플러그인 쪽 짝]. 위에서부터 처음 맞는 것을 쓴다. */
const RULES = [
  // 끌어다 놓기 전용. 읽기 전용이라 부를 곳이 없다.
  [/^lib\/timeline\/(grid-)?reorder(\.test)?\.ts$/, "무시", null],
  [/^lib\/timeline\/(.+)\.ts$/, "반영", "src/lib/$1.ts"],
  [/^lib\/api\/types\.ts$/, "반영", "src/lib/types.ts"],
  [/^lib\/colors(\.test)?\.ts$/, "반영", "src/loader/config.ts (DEFAULT_COLOR)"],
  [/^components\/timeline\/EventFormModal\.tsx$/, "무시", null],
  [/^components\/timeline\/TimelineGrid\.tsx$/, "반영", "src/view/renderGrid.ts + styles.css"],
  [/^components\/timeline\/(EventCardList|EventEraGroups)\.tsx$/, "반영", "src/view/renderTime.ts + shared.ts + styles.css"],
  [/^components\/timeline\/LaneFilter\.tsx$/, "반영", "src/view/renderGrid.ts (열 필터)"],
  [/^components\/timeline\/ViewToggle\.tsx$/, "반영", "src/view/TimelineView.ts (토글)"],
  [/^components\/ui\/EntityChip\.tsx$/, "반영", "src/view/shared.ts + styles.css"],
  [/^app\/worlds\/\[worldId\]\/WorldTimelineView\.tsx$/, "반영", "src/view/TimelineView.ts"],
  [/^store\/useTimelineViewStore\.ts$/, "반영", "src/view/TimelineView.ts (상태)"],
  [/^app\/(globals\.css|layout\.tsx)$/, "반영", "styles.css"],
  [/^(README|DECISIONS|ROADMAP)\.md$/, "참고", null],
];

function classify(path) {
  for (const [pattern, kind, target] of RULES) {
    if (pattern.test(path)) return { kind, target: target && path.replace(pattern, target) };
  }
  return { kind: "무시", target: null };
}

function git(...args) {
  return execFileSync("git", ["-C", upstream, ...args], {
    encoding: "utf-8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function fail(message) {
  console.error(`upstream: ${message}`);
  process.exit(1);
}

/** 원장에서 "검토 완료: <커밋>" 줄을 읽는다. */
function readMarker() {
  let text;
  try {
    text = readFileSync(LEDGER, "utf-8");
  } catch {
    fail(`${LEDGER}을 읽지 못했다.`);
  }
  const match = text.match(/^검토 완료:\s*`?([0-9a-f]{7,40})`?/m);
  if (!match) fail(`${LEDGER}에 "검토 완료: <커밋>" 줄이 없다.`);
  return match[1];
}

try {
  git("rev-parse", "--git-dir");
} catch {
  fail(`원본 clone을 찾지 못했다: ${upstream}\n  LORELINE_UPSTREAM으로 위치를 지정할 것.`);
}

git("fetch", "--quiet", "origin");

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const since = args.find((arg) => !arg.startsWith("--")) ?? readMarker();

/** 원본이 blame에서 빼 둔 커밋. 일괄 서식 정리라 옮길 내용이 없다. */
function formattingCommits() {
  let text;
  try {
    text = git("show", "origin/main:.git-blame-ignore-revs");
  } catch {
    return new Set();
  }
  return new Set(
    text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => /^[0-9a-f]{40}$/.test(line)),
  );
}

function kindOf(classified) {
  if (classified.some((f) => f.kind === "반영")) return "반영";
  if (classified.some((f) => f.kind === "참고")) return "참고";
  return "무시";
}

const formatting = formattingCommits();
const head = git("rev-parse", "--short", "origin/main");
const log = git("log", "--reverse", "--format=%h%x09%ad%x09%s", "--date=short", `${since}..origin/main`);

const commits = (log ? log.split("\n") : []).map((line) => {
  const [sha, date, subject] = line.split("\t");
  if (formatting.has(git("rev-parse", sha))) {
    return { sha, date, subject, kind: "서식", files: [] };
  }
  const files = git("show", "--name-only", "--format=", sha)
    .split("\n")
    .filter(Boolean)
    .map((path) => ({ path, ...classify(path) }));
  return { sha, date, subject, kind: kindOf(files), files };
});

const tally = { 반영: 0, 참고: 0, 서식: 0, 무시: 0 };
for (const commit of commits) tally[commit.kind] += 1;

/** 짝이 있는 파일만. 무시할 파일까지 늘어놓으면 읽을 것이 묻힌다. */
function relevantFiles(commit) {
  return commit.files.filter((file) => file.kind !== "무시");
}

/** GitHub 이슈 본문. 워크플로가 이것을 그대로 쓴다. */
function toMarkdown() {
  const lines = [
    `원본 [LoreLine](https://github.com/00TaciTa00/LoreLine)에 검토할 커밋이 있다.`,
    "",
    `범위: \`${since}..${head}\` — 반영 ${tally.반영} · 참고 ${tally.참고} · 서식 ${tally.서식} · 무시 ${tally.무시}`,
    "",
  ];
  for (const commit of commits) {
    if (commit.kind !== "반영" && commit.kind !== "참고") continue;
    const link = `https://github.com/00TaciTa00/LoreLine/commit/${commit.sha}`;
    lines.push(`- [ ] **${commit.kind}** [\`${commit.sha}\`](${link}) ${commit.date} ${commit.subject}`);
    for (const file of relevantFiles(commit)) {
      lines.push(`  - \`${file.path}\`${file.target ? ` → ${file.target}` : ""}`);
    }
  }
  lines.push(
    "",
    `검토 절차는 \`UPSTREAM.md\`에 있다. 검토를 마치면 "검토 완료"를 \`${head}\`로 올리고 이 이슈를 닫는다.`,
  );
  return lines.join("\n");
}

if (asJson) {
  console.log(
    JSON.stringify({ since, head, tally, commits, markdown: toMarkdown() }, null, 2),
  );
  process.exit(0);
}

console.log(`원본: ${upstream}`);
console.log(`범위: ${since}..origin/main (${head}) — 커밋 ${commits.length}개\n`);

if (commits.length === 0) {
  console.log("새 커밋이 없다.");
  process.exit(0);
}

for (const commit of commits) {
  console.log(`[${commit.kind}] ${commit.sha} ${commit.date} ${commit.subject}`);
  for (const file of relevantFiles(commit)) {
    console.log(`         ${file.path}${file.target ? `  →  ${file.target}` : ""}`);
  }
}

console.log(`\n반영 ${tally.반영} · 참고 ${tally.참고} · 서식 ${tally.서식} · 무시 ${tally.무시}`);
console.log(`검토를 마치면 ${LEDGER}의 "검토 완료"를 ${head}로 올리고 표에 결정을 적는다.`);
