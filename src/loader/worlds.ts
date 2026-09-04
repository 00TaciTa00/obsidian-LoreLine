import type { App, TFile } from "obsidian";

import { CONFIG_FILE_NAME, parseConfig } from "./config";

/**
 * 하나의 세계 — 볼트 안에서 따로 굴러가는 타임라인 하나.
 *
 * `loreline.config.json`이 놓인 폴더가 곧 세계의 뿌리다. 세계 목록을 설정에
 * 두지 않으므로 여기 담긴 것은 전부 볼트에서 읽어낸 값이고, 뷰의 탭 상태로
 * 그대로 저장된다.
 */
export type World = {
  /** 뿌리 폴더의 볼트 경로. 볼트 최상위면 빈 문자열 */
  folder: string;
  /** 정의 파일의 볼트 경로 */
  configPath: string;
  /** 화면에 쓸 이름 */
  name: string;
};

/**
 * 정의 파일 경로에서 뿌리 폴더를 얻는다.
 *
 * 최상위에 둔 파일은 폴더가 없으므로 빈 문자열이 된다. 스캐너에서 빈 폴더는
 * 볼트 전체를 뜻하니 앞뒤가 맞는다.
 */
export function worldFolderOf(configPath: string): string {
  const cut = configPath.lastIndexOf("/");
  return cut === -1 ? "" : configPath.slice(0, cut);
}

/**
 * 세계의 이름.
 *
 * 정의 파일에 적은 이름이 가장 앞서고, 없으면 폴더명을 쓴다. 최상위에 둔
 * 세계는 폴더명이랄 것이 없어 볼트 이름으로 부른다.
 */
export function worldNameOf(folder: string, configured: string | null, vaultName: string): string {
  if (configured) return configured;
  if (!folder) return vaultName;
  return folder.split("/").at(-1) ?? folder;
}

/** 이름순. 같으면 경로순으로 고정해 볼 때마다 순서가 흔들리지 않게 한다. */
export function sortWorlds(worlds: World[]): World[] {
  return [...worlds].sort(
    (a, b) => a.name.localeCompare(b.name, "ko") || a.folder.localeCompare(b.folder, "ko"),
  );
}

/**
 * 볼트에서 세계를 모두 찾는다.
 *
 * 정의 파일을 읽어 이름까지 채운다. 세계는 보통 몇 개뿐이라 전부 읽어도 싸다.
 * 파일이 깨져 있어도 세계 자체는 성립한다 — 이름만 폴더명으로 물러난다.
 */
export async function findWorlds(app: App): Promise<World[]> {
  const vaultName = app.vault.getName();

  const configs = app.vault.getFiles().filter((file: TFile) => file.name === CONFIG_FILE_NAME);

  const worlds = await Promise.all(
    configs.map(async (file) => {
      const folder = worldFolderOf(file.path);

      let configured: string | null = null;
      try {
        configured = parseConfig(await app.vault.cachedRead(file)).config.name;
      } catch {
        // 못 읽어도 세계는 있다. 이름만 폴더명으로 간다.
      }

      return {
        folder,
        configPath: file.path,
        name: worldNameOf(folder, configured, vaultName),
      };
    }),
  );

  return sortWorlds(worlds);
}
