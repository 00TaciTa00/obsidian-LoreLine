/**
 * package.json의 버전을 manifest.json과 versions.json에 옮긴다.
 *
 * `npm version patch`가 부를 자리다. 세 파일의 버전이 어긋나면 릴리스
 * 워크플로가 태그와 manifest를 대조하다 멈춘다.
 */
import { readFileSync, writeFileSync } from "node:fs";
import process from "node:process";

const version = process.env.npm_package_version;
if (!version) {
  console.error("npm_package_version이 없다. `npm version <patch|minor|major>`로 부를 것.");
  process.exit(1);
}

const manifest = JSON.parse(readFileSync("manifest.json", "utf-8"));
manifest.version = version;
writeFileSync("manifest.json", `${JSON.stringify(manifest, null, 2)}\n`);

// 이 버전이 요구하는 최소 앱 버전. 옵시디언이 호환 여부를 이것으로 본다.
const versions = JSON.parse(readFileSync("versions.json", "utf-8"));
versions[version] = manifest.minAppVersion;
writeFileSync("versions.json", `${JSON.stringify(versions, null, 2)}\n`);

console.log(`${version} (최소 앱 ${manifest.minAppVersion})`);
