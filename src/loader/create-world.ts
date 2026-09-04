import { TFolder, type App } from "obsidian";

import { CONFIG_FILE_NAME } from "./config";
import { worldNameOf, type World } from "./worlds";

/**
 * 새 세계 만들기.
 *
 * 이 플러그인이 볼트에 무언가를 쓰는 유일한 자리다. 쓰는 것은 정의 파일 한
 * 장뿐이고, 사건·인물·장소 노트는 건드리지 않는다. 읽기 전용이라는 약속은
 * "서사 데이터를 뷰에서 고치지 않는다"는 뜻이고, 세계를 선언하는 파일 하나를
 * 놓아 주는 것은 그 약속 밖이다.
 */

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
 */
export function buildStarterConfig(name: string): string {
  return `${JSON.stringify({ name, characters: [], places: [], eras: [] }, null, 2)}\n`;
}

export type CreateWorldInput = {
  /** 세계를 둘 폴더. 없으면 만든다. */
  folder: string;
  /** 표시 이름. 비우면 폴더명을 쓴다. */
  name?: string;
};

/**
 * 폴더에 정의 파일을 놓아 세계로 만든다.
 *
 * 이미 정의 파일이 있으면 **아무것도 하지 않고 던진다.** 덮어쓰면 그 세계의
 * 색과 순서가 통째로 날아간다.
 */
export async function createWorld(app: App, input: CreateWorldInput): Promise<World> {
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
  if (!existing) {
    await app.vault.createFolder(folder);
  }

  const name = input.name?.trim() || worldNameOf(folder, null, app.vault.getName());
  await app.vault.create(configPath, buildStarterConfig(name));

  return { folder, configPath, name };
}
