import { TFolder, type App } from "obsidian";

import { CONFIG_FILE_NAME } from "./config";
import { isInFolder } from "./scan";
import { worldNameOf, type World } from "./worlds";

/**
 * 새 세계 만들기.
 *
 * 이 플러그인이 볼트에 무언가를 쓰는 유일한 자리다. 쓰는 것은 세계의 뼈대뿐이고
 * — 정의 파일, 노트 종류별 폴더, 형식을 보여 주는 예제 한 장씩 — 이미 있는
 * 파일은 어떤 경우에도 건드리지 않는다. 읽기 전용이라는 약속은 "서사 데이터를
 * 뷰에서 고치지 않는다"는 뜻이고, 빈 자리를 마련해 주는 것은 그 약속 밖이다.
 */

/** 노트 종류별 폴더 이름. frontmatter의 loreline 값과 1:1로 맞춘다. */
export const WORLD_FOLDERS = {
  event: "사건",
  character: "인물",
  place: "장소",
  era: "기간",
} as const;

/** 만들어 둘 폴더 이름들 (사건 → 인물 → 장소 → 기간) */
export const WORLD_FOLDER_NAMES: readonly string[] = Object.values(WORLD_FOLDERS);

export type StarterNote = { path: string; content: string };

/**
 * 사람이 적은 폴더 경로를 볼트 경로로 다듬는다.
 *
 * 역슬래시로 적거나(윈도우 습관) 슬래시를 겹쳐 적어도 받아 준다. `.`과 `..`은
 * 통째로 버린다 — 볼트 밖으로 나가는 경로를 만들 이유가 없다.
 */
export function normalizeFolderPath(raw: string): string {
  return raw
    .trim()
    .split(/[/\\]+/)
    .map((segment) => segment.trim())
    .filter((segment) => segment && segment !== "." && segment !== "..")
    .join("/");
}

/**
 * 새 정의 파일의 내용.
 *
 * 빈 칸이라도 세 구획을 적어 둔다. 파일을 열었을 때 무엇을 채우면 되는지
 * 보이는 편이, `{}` 한 줄만 있는 것보다 낫다.
 *
 * 예제 노트의 이름을 여기 미리 넣지는 않는다. 예제를 지웠을 때 "정의 파일엔
 * 있는데 노트가 없다"는 경고가 뜨는 것이 첫인상으로는 나쁘다.
 */
export function buildStarterConfig(name: string): string {
  return `${JSON.stringify({ name, characters: [], places: [], eras: [] }, null, 2)}\n`;
}

/**
 * 폴더마다 넣어 둘 예제 한 장.
 *
 * 서로를 이름으로 가리키게 해 두어, 세계를 만들자마자 타임라인에 사건 하나가
 * 실제로 서 있게 한다. 형식이 글로만 적혀 있는 것보다 눈으로 한 번 보는 편이
 * 빠르다.
 */
export function starterNotes(folder: string): StarterNote[] {
  const at = (kind: keyof typeof WORLD_FOLDERS, title: string) =>
    `${folder}/${WORLD_FOLDERS[kind]}/${title}.md`;

  return [
    {
      path: at("event", "예시 사건"),
      content: `---
loreline: event
displayTime: "1년 봄"
sortKey: 1000
era: "예시 기간"
characters: ["예시 인물"]
places: ["예시 장소"]
---
# 예시 사건

이 본문이 카드에 보이는 설명이 된다. 제목은 맨 앞 H1을 쓰고, 없으면 파일명을 쓴다.

\`sortKey\`는 정렬 전용 숫자다. 사이에 사건을 끼워 넣을 수 있게 1000 단위로 띄워
두기를 권한다. \`displayTime\`은 화면에 그대로 찍히는 자유 문자열이라 "3년째 겨울"
처럼 적어도 된다. 다만 **글자가 정확히 같은 것끼리만** 한 행으로 묶이니 표기를
통일하는 편이 좋다.

\`era\`, \`characters\`, \`places\`에 적은 이름은 옆 폴더의 노트와 이어진다.
색과 순서는 ${CONFIG_FILE_NAME}에서 같은 이름으로 정한다.

이 노트는 지우고 진짜 사건을 쓰면 된다.
`,
    },
    {
      path: at("character", "예시 인물"),
      content: `---
loreline: character
---
파일명이 곧 인물 이름이다. 사건 노트의 \`characters\`에 이 이름을 적으면 이어진다.

본문은 플러그인이 읽지 않으니 설정이든 관계든 자유롭게 쓴다. 옵시디언의 링크와
백링크가 여기서 평소처럼 동작한다.

이 노트가 있어야 사건이 하나도 없는 인물도 인물별 격자에 열로 선다.
`,
    },
    {
      path: at("place", "예시 장소"),
      content: `---
loreline: place
---
파일명이 곧 장소 이름이다. 사건 노트의 \`places\`에 이 이름을 적으면 이어진다.

본문은 플러그인이 읽지 않는다. 지도든 설정이든 자유롭게 쓴다.
`,
    },
    {
      path: at("era", "예시 기간"),
      content: `---
loreline: era
---
파일명이 곧 기간 이름이다. 사건 노트의 \`era\`에 이 이름을 적으면 그 기간으로 묶인다.

기간은 시간별 뷰에서 구획이 된다. 순서와 색은 ${CONFIG_FILE_NAME}의 \`eras\`에서
정한다.
`,
    },
  ];
}

export type CreateWorldInput = {
  /** 세계를 둘 폴더. 없으면 만든다. */
  folder: string;
  /** 표시 이름. 비우면 폴더명을 쓴다. */
  name?: string;
};

export type CreateWorldResult = {
  world: World;
  /** 새로 만든 폴더 (이미 있던 것은 빠진다) */
  createdFolders: string[];
  /** 새로 만든 예제 노트 (건너뛴 것은 빠진다) */
  createdNotes: string[];
};

/** 그 폴더 아래에 loreline 노트가 이미 있는지 */
function hasLorelineNotes(app: App, folder: string): boolean {
  return app.vault
    .getMarkdownFiles()
    .filter((file) => isInFolder(file.path, folder))
    .some((file) => app.metadataCache.getFileCache(file)?.frontmatter?.loreline !== undefined);
}

/** 없을 때만 만든다. 만들었으면 true. */
async function ensureFolder(app: App, path: string): Promise<boolean> {
  if (app.vault.getAbstractFileByPath(path)) return false;
  await app.vault.createFolder(path);
  return true;
}

/** 없을 때만 쓴다. 썼으면 true. 이미 있는 파일은 절대 덮지 않는다. */
async function writeIfAbsent(app: App, path: string, content: string): Promise<boolean> {
  if (app.vault.getAbstractFileByPath(path)) return false;
  await app.vault.create(path, content);
  return true;
}

/**
 * 폴더에 세계의 뼈대를 놓는다.
 *
 * 이미 정의 파일이 있으면 **아무것도 하지 않고 던진다.** 덮어쓰면 그 세계의
 * 색과 순서가 통째로 날아간다.
 *
 * 예제 노트는 그 폴더에 loreline 노트가 아직 하나도 없을 때만 넣는다. 노트를
 * 먼저 써 두고 나중에 세계로 선언하는 경우에는 형식을 이미 아는 것이고,
 * 남의 폴더에 예시를 흩뿌리는 꼴이 된다.
 */
export async function createWorld(
  app: App,
  input: CreateWorldInput,
): Promise<CreateWorldResult> {
  const folder = normalizeFolderPath(input.folder);
  if (!folder) {
    throw new Error("세계를 둘 폴더를 적어야 한다.");
  }

  const configPath = `${folder}/${CONFIG_FILE_NAME}`;
  if (app.vault.getAbstractFileByPath(configPath)) {
    throw new Error(`"${folder}"는 이미 세계다. ${CONFIG_FILE_NAME}이 그 안에 있다.`);
  }

  const existing = app.vault.getAbstractFileByPath(folder);
  if (existing && !(existing instanceof TFolder)) {
    throw new Error(`"${folder}"는 폴더가 아니라 파일이다.`);
  }

  // 예제를 넣을지는 폴더를 만들기 전에 정한다. 만든 뒤에 보면 항상 비어 있다.
  const withSamples = !existing || !hasLorelineNotes(app, folder);

  const createdFolders: string[] = [];
  if (!existing) {
    await app.vault.createFolder(folder);
    createdFolders.push(folder);
  }
  for (const name of WORLD_FOLDER_NAMES) {
    const path = `${folder}/${name}`;
    if (await ensureFolder(app, path)) createdFolders.push(path);
  }

  const name = input.name?.trim() || worldNameOf(folder, null, app.vault.getName());
  await app.vault.create(configPath, buildStarterConfig(name));

  const createdNotes: string[] = [];
  if (withSamples) {
    for (const note of starterNotes(folder)) {
      if (await writeIfAbsent(app, note.path, note.content)) createdNotes.push(note.path);
    }
  }

  return { world: { folder, configPath, name }, createdFolders, createdNotes };
}
