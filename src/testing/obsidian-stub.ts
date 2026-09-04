/**
 * `obsidian` 모듈을 대신하는 껍데기.
 *
 * 테스트(vitest)와 미리보기 번들이 모두 이것을 본다. 옵시디언 API를 흉내 내는
 * 것이 목적이 아니라, 값으로 import하는 몇 개 때문에 모듈 해석이 막히지 않게
 * 하는 것이 목적이다. 플러그인 번들에는 들어가지 않는다.
 */

/** 볼트의 파일. config.ts가 instanceof로 폴더와 가른다. */
export class TFile {
  path = "";
  /** 확장자까지 붙은 파일 이름 */
  name = "";
  basename = "";
  extension = "";
  stat = { mtime: 0, ctime: 0, size: 0 };
}

export class TFolder {
  path = "";
  name = "";
  children: unknown[] = [];
}

/** 실제로는 화면 구석에 뜨는 알림. 여기서는 뜬 것만 기록한다. */
export class Notice {
  static shown: string[] = [];

  constructor(message: string) {
    Notice.shown.push(message);
  }

  static reset(): void {
    Notice.shown = [];
  }
}

export const Keymap = {
  /** 테스트에서 바꿔 끼울 수 있게 열어 둔다. */
  isModEvent: (_event?: unknown): boolean => false,
};

/** 세계 고르기 목록. 테스트에서는 열 일이 없어 모양만 갖춘다. */
export class FuzzySuggestModal<T> {
  constructor(_app?: unknown) {}
  setPlaceholder(_text: string): void {}
  open(): void {}
  getItems(): T[] {
    return [];
  }
}
