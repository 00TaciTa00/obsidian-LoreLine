/**
 * 빌드 산출물을 테스트 볼트의 플러그인 폴더로 복사한다.
 * 볼트 경로는 OBSIDIAN_VAULT 환경변수로 바꿀 수 있다.
 */
import { copyFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";

const vault = process.env.OBSIDIAN_VAULT ?? "C:/Obsidian/Hobby";
// 폴더 이름은 manifest의 id와 같아야 옵시디언이 알아본다.
const { id } = JSON.parse(await readFile("manifest.json", "utf-8"));
const target = join(vault, ".obsidian", "plugins", id);

await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(file, join(target, file));
}
console.log(`복사 완료 → ${target}`);
