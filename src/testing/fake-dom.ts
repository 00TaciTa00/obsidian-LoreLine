/**
 * 렌더러가 쓰는 옵시디언 DOM 헬퍼(createDiv/createEl/createSpan/addClass 등)를
 * 흉내 내 HTML 문자열을 만든다.
 *
 * 브라우저도 옵시디언도 없이 렌더러를 그대로 돌려 보려고 만든 미리보기 전용
 * 도구다. 렌더러 코드는 손대지 않으므로, 여기서 나온 결과는 실제 뷰의 DOM과
 * 같은 모양이다.
 */

type ElOptions = { cls?: string; text?: string };

type Handler = (event: unknown) => void;

const VOID_TAGS = new Set(["br", "hr", "img", "input"]);

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export class FakeEl {
  readonly tag: string;
  private classes: string[] = [];
  private styles = new Map<string, string>();
  private children: (FakeEl | string)[] = [];
  private attrs = new Map<string, string>();

  /** td.colSpan = n 처럼 속성으로 직접 대입하는 자리 */
  set colSpan(value: number) {
    this.attrs.set("colspan", String(value));
  }

  readonly style = {
    setProperty: (name: string, value: string) => {
      this.styles.set(name, value);
    },
  };

  constructor(tag: string, options: ElOptions = {}) {
    this.tag = tag;
    if (options.cls) this.classes.push(...options.cls.split(/\s+/).filter(Boolean));
    if (options.text) this.children.push(options.text);
  }

  addClass(cls: string): void {
    if (!this.classes.includes(cls)) this.classes.push(cls);
  }

  setAttribute(name: string, value: string): void {
    this.attrs.set(name, value);
  }

  empty(): void {
    this.children = [];
  }

  private handlers = new Map<string, Handler[]>();

  addEventListener(type: string, handler: Handler): void {
    const bucket = this.handlers.get(type);
    if (bucket) bucket.push(handler);
    else this.handlers.set(type, [handler]);
  }

  /** 테스트에서 이 요소에 사건을 흘려 넣는다. 미리보기는 쓰지 않는다. */
  dispatch(type: string, event: Record<string, unknown> = {}): void {
    for (const handler of this.handlers.get(type) ?? []) {
      handler({ type, preventDefault: () => {}, ...event });
    }
  }

  /** 이 요소가 그 종류의 사건을 듣고 있는지 */
  listensTo(type: string): boolean {
    return (this.handlers.get(type) ?? []).length > 0;
  }

  createEl(tag: string, options: ElOptions = {}): FakeEl {
    const child = new FakeEl(tag, options);
    this.children.push(child);
    return child;
  }

  createDiv(options: ElOptions = {}): FakeEl {
    return this.createEl("div", options);
  }

  createSpan(options: ElOptions = {}): FakeEl {
    return this.createEl("span", options);
  }

  hasClass(cls: string): boolean {
    return this.classes.includes(cls);
  }

  attr(name: string): string | undefined {
    return this.attrs.get(name);
  }

  cssVar(name: string): string | undefined {
    return this.styles.get(name);
  }

  /** 자신을 포함해 아래로 훑어 그 class를 가진 요소를 모은다. */
  queryAll(cls: string): FakeEl[] {
    const found: FakeEl[] = [];
    if (this.hasClass(cls)) found.push(this);
    for (const child of this.children) {
      if (typeof child !== "string") found.push(...child.queryAll(cls));
    }
    return found;
  }

  query(cls: string): FakeEl | undefined {
    return this.queryAll(cls)[0];
  }

  /** 태그 이름으로 훑는다. 표처럼 class를 안 붙인 곳에 쓴다. */
  queryAllTags(tag: string): FakeEl[] {
    const found: FakeEl[] = [];
    if (this.tag === tag) found.push(this);
    for (const child of this.children) {
      if (typeof child !== "string") found.push(...child.queryAllTags(tag));
    }
    return found;
  }

  /** 아래에 있는 글자를 모두 이어 붙인 것 */
  get text(): string {
    return this.children
      .map((child) => (typeof child === "string" ? child : child.text))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  toHtml(indent = 0): string {
    const pad = "  ".repeat(indent);

    const parts: string[] = [];
    if (this.classes.length > 0) parts.push(`class="${this.classes.join(" ")}"`);
    for (const [name, value] of this.attrs) parts.push(`${name}="${escapeHtml(value)}"`);
    if (this.styles.size > 0) {
      const css = [...this.styles].map(([k, v]) => `${k}: ${v}`).join("; ");
      parts.push(`style="${escapeHtml(css)}"`);
    }
    const open = [this.tag, ...parts].join(" ");

    if (VOID_TAGS.has(this.tag)) return `${pad}<${open}>`;
    if (this.children.length === 0) return `${pad}<${open}></${this.tag}>`;

    const inner = this.children
      .map((child) => (typeof child === "string" ? `${pad}  ${escapeHtml(child)}` : child.toHtml(indent + 1)))
      .join("\n");
    return `${pad}<${open}>\n${inner}\n${pad}</${this.tag}>`;
  }
}

/** 렌더러가 기대하는 HTMLElement 자리에 넣을 가짜 요소 */
export function fakeElement(tag = "div"): FakeEl {
  return new FakeEl(tag);
}
