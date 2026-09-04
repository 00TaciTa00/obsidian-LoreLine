/**
 * 렌더러가 쓰는 옵시디언 DOM 헬퍼(createDiv/createEl/createSpan/addClass 등)를
 * 흉내 내 HTML 문자열을 만든다.
 *
 * 브라우저도 옵시디언도 없이 렌더러를 그대로 돌려 보려고 만든 미리보기 전용
 * 도구다. 렌더러 코드는 손대지 않으므로, 여기서 나온 결과는 실제 뷰의 DOM과
 * 같은 모양이다.
 */

type ElOptions = { cls?: string; text?: string };

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

  empty(): void {
    this.children = [];
  }

  /** 미리보기에서는 클릭이 일어날 일이 없어 받아만 두고 버린다. */
  addEventListener(): void {}

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
