"""LoreLine 웹앱의 세계 하나를 옵시디언 볼트의 노트로 옮긴다.

일회성 도구다. API가 주는 HTML 설명을 마크다운으로 바꾸고, 이름을 파일명으로
쓰고, 색·순서를 loreline.config.json에 모은다.
"""

import html
import io
import json
import os
import re
import sys

SRC = ".import-tmp"
# 있는 파일을 덮어쓰는 도구라 쓸 자리를 기본값으로 두지 않는다.
if len(sys.argv) < 3:
    sys.exit('사용법: python tools/import-world/import.py "<볼트>/<세계 폴더>" "<세계 이름>"')
DEST = sys.argv[1]
WORLD_NAME = sys.argv[2]

FOLDERS = {"event": "사건", "character": "인물", "place": "장소", "era": "기간"}

# 윈도우·옵시디언에서 파일명에 못 쓰는 글자
BAD_CHARS = re.compile(r'[\\/:*?"<>|#^\[\]]')


def to_markdown(raw):
    """API가 주는 HTML 설명을 마크다운 본문으로."""
    if not raw:
        return ""

    text = raw
    text = re.sub(r"<br\s*/?>", "\n", text)
    text = re.sub(r"</p>\s*<p>", "\n\n", text)
    text = re.sub(r"</?p>", "", text)
    text = re.sub(r"<(strong|b)>(.*?)</\1>", r"**\2**", text, flags=re.S)
    text = re.sub(r"<(em|i)>(.*?)</\1>", r"*\2*", text, flags=re.S)
    text = re.sub(r"<li>(.*?)</li>", r"- \1\n", text, flags=re.S)
    text = re.sub(r"</?[uo]l>", "\n", text)
    text = re.sub(r"<[^>]+>", "", text)
    text = html.unescape(text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def safe_name(name):
    """이름을 파일명으로. 바뀌었으면 호출한 쪽이 알 수 있게 함께 돌려준다."""
    cleaned = BAD_CHARS.sub("-", name)
    cleaned = re.sub(r"\s+", " ", cleaned).strip().strip(".")
    return cleaned or "이름 없음"


def quote(value):
    """YAML 스칼라. JSON 인용이 YAML에서도 그대로 통한다."""
    return json.dumps(str(value), ensure_ascii=False)


def load(kind):
    with io.open(f"{SRC}/{kind}.json", encoding="utf-8") as handle:
        data = json.load(handle)
    return data[kind]


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with io.open(path, "w", encoding="utf-8", newline="\n") as handle:
        handle.write(text)


def sort_key(item):
    try:
        return int(item["sortKey"])
    except (TypeError, ValueError):
        return 0


def main():
    eras = load("eras")
    places = load("places")
    characters = load("characters")
    events = load("events")

    renamed = []
    for item in eras + places + characters:
        if safe_name(item["name"]) != item["name"]:
            renamed.append((item["name"], safe_name(item["name"])))

    # 1) 인물·장소·기간 노트
    for kind, items in (("era", eras), ("place", places), ("character", characters)):
        for item in items:
            body = to_markdown(item.get("description"))
            note = f"---\nloreline: {kind}\n---\n"
            if body:
                note += f"\n{body}\n"
            write(f"{DEST}/{FOLDERS[kind]}/{safe_name(item['name'])}.md", note)

    # 2) 사건 노트
    used = {}
    for event in sorted(events, key=sort_key):
        title = event["title"]
        base = safe_name(title)
        # 제목이 겹치면 파일이 서로를 덮는다.
        used[base] = used.get(base, 0) + 1
        filename = base if used[base] == 1 else f"{base} ({used[base]})"

        lines = ["---", "loreline: event"]
        lines.append(f"displayTime: {quote(event['displayTime'])}")
        lines.append(f"sortKey: {sort_key(event)}")
        if event.get("era"):
            lines.append(f"era: {quote(event['era']['name'])}")

        for field, key in (("characters", "characters"), ("places", "places")):
            names = [quote(entry["name"]) for entry in event.get(key) or []]
            if names:
                lines.append(f"{field}: [{', '.join(names)}]")

        if event.get("color"):
            lines.append(f"color: {quote(event['color'])}")
        lines.append("---")

        # 파일명이 다듬어졌어도 제목은 그대로 보이게 H1을 둔다.
        body = to_markdown(event.get("description"))
        note = "\n".join(lines) + f"\n\n# {title}\n"
        if body:
            note += f"\n{body}\n"
        write(f"{DEST}/{FOLDERS['event']}/{filename}.md", note)

    # 3) 정의 파일 — 색과 순서
    def entries(items):
        return [
            {"name": item["name"], "color": item["color"], "order": sort_key(item)}
            for item in sorted(items, key=sort_key)
        ]

    config = {
        "name": WORLD_NAME,
        "characters": entries(characters),
        "places": entries(places),
        "eras": entries(eras),
    }
    write(f"{DEST}/loreline.config.json", json.dumps(config, ensure_ascii=False, indent=2) + "\n")

    print(f"기간 {len(eras)}, 장소 {len(places)}, 인물 {len(characters)}, 사건 {len(events)}")
    if renamed:
        print("!! 파일명으로 못 쓰는 글자가 있어 이름이 바뀌었다 (이름 매칭이 깨진다):")
        for before, after in renamed:
            print(f"   {before} -> {after}")


main()
