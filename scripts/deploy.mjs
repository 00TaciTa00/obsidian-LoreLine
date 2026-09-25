/**
 * 빌드 산출물을 테스트 볼트의 플러그인 폴더로 복사한다.
 *
 * 볼트 경로는 기기마다 다르므로 레포에 박아 두지 않는다. 다음 순서로 찾는다.
 *   1. OBSIDIAN_VAULT 환경변수
 *   2. deploy.local.json 의 "vault" (gitignore 대상)
 *
 * 볼트가 아닌 곳에는 복사하지 않는다. 예전에는 경로가 틀려도 폴더를 새로 만들어
 * "복사 완료"를 찍었기 때문에, 옵시디언은 낡은 플러그인을 그대로 돌리는데
 * 배포는 성공한 것처럼 보였다.
 */
import { copyFile, mkdir, readFile, stat } from "node:fs/promises";
import { join, resolve } from "node:path";
import process from "node:process";

const LOCAL_CONFIG = "deploy.local.json";

function fail(message) {
  console.error(`deploy: ${message}`);
  process.exit(1);
}

async function isDirectory(path) {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

async function readLocalVault() {
  let text;
  try {
    text = await readFile(LOCAL_CONFIG, "utf-8");
  } catch {
    return null;
  }

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    fail(`${LOCAL_CONFIG}이 올바른 JSON이 아니다 — ${error.message}`);
  }
  if (typeof parsed?.vault !== "string" || !parsed.vault.trim()) {
    fail(`${LOCAL_CONFIG}에 "vault" 문자열이 없다.`);
  }
  return parsed.vault.trim();
}

const vault = process.env.OBSIDIAN_VAULT?.trim() || (await readLocalVault());

if (!vault) {
  fail(
    [
      "볼트 경로가 정해지지 않았다. 둘 중 하나로 지정할 것:",
      `  - ${LOCAL_CONFIG}: { "vault": "C:/경로/볼트" }`,
      "  - 환경변수 OBSIDIAN_VAULT",
    ].join("\n"),
  );
}

if (!(await isDirectory(vault))) {
  fail(`볼트 폴더가 없다: ${resolve(vault)}`);
}
// .obsidian은 옵시디언이 볼트로 한 번 열어야 생긴다. 없으면 볼트가 아니다.
if (!(await isDirectory(join(vault, ".obsidian")))) {
  fail(`${resolve(vault)}에 .obsidian 폴더가 없다. 옵시디언에서 이 폴더를 볼트로 한 번 열 것.`);
}

// 폴더 이름은 manifest의 id와 같아야 옵시디언이 알아본다.
const { id } = JSON.parse(await readFile("manifest.json", "utf-8"));
const target = join(vault, ".obsidian", "plugins", id);

await mkdir(target, { recursive: true });
for (const file of ["main.js", "manifest.json", "styles.css"]) {
  await copyFile(file, join(target, file));
}
console.log(`복사 완료 → ${resolve(target)}`);
console.log("옵시디언에서 플러그인을 껐다 켜거나 앱을 다시 불러와야 반영된다.");
