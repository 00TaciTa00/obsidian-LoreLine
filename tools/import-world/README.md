# LoreLine 웹앱 → 볼트

웹앱([LoreLine](https://github.com/00TaciTa00/LoreLine))에 이미 쌓아 둔 세계를
옵시디언 노트로 옮긴다. 일회성 도구다 — 옮기고 나면 볼트가 원본이 되고, 이후
편집은 마크다운에서 한다.

```bash
# 1. 세계 하나의 네 가지를 받는다 (worldId를 바꿔 쓴다)
mkdir -p .import-tmp
for kind in eras places characters events; do
  curl -s "https://<앱 주소>/api/worlds/4/$kind" -o ".import-tmp/$kind.json"
done

# 2. 볼트에 쓴다
python tools/import-world/import.py "C:/Obsidian/Hobby/세계 이름" "세계 이름"
```

받아 오는 것과 만드는 것:

| API | 만드는 것 |
|-----|-----------|
| `eras` | `기간/<이름>.md` (`loreline: era`) |
| `places` | `장소/<이름>.md` (`loreline: place`) |
| `characters` | `인물/<이름>.md` (`loreline: character`) |
| `events` | `사건/<제목>.md` (frontmatter 전부 + 본문) |
| 위 셋의 색·순서 | `loreline.config.json` |

- API가 주는 HTML 설명(`<p>`, `<strong>`…)을 마크다운으로 바꾼다
- `sortKey`(BIGINT 문자열, 음수도 있다)를 숫자로 옮긴다. 웹앱의 순서가 그대로 선다
- 제목이 겹치면 뒤에 번호를 붙인다. 파일명에 못 쓰는 글자는 `-`로 바꾸고,
  **인물·장소·기간의 이름이 그렇게 바뀌면 경고한다** — 이름으로 잇는 구조라
  파일명이 달라지면 연결이 끊긴다
- 사건 노트에는 항상 H1을 넣는다. 파일명이 다듬어져도 제목은 원래대로 보인다

**있는 파일을 덮어쓴다.** 이미 쓴 노트가 있는 폴더에는 쓰지 말 것.
