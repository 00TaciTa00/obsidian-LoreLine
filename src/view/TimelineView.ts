import { ItemView, type WorkspaceLeaf } from "obsidian";

import { computeLanes, keepExistingLanes } from "../lib/lanes";
import { loadLoreData } from "../loader/load";
import type { LoreData } from "../lib/types";
import { renderGrid } from "./renderGrid";
import { renderTime } from "./renderTime";
import { renderEmpty } from "./shared";

import type LoreLinePlugin from "../main";

export const VIEW_TYPE_LORELINE = "loreline-timeline";

/** 상단 토글이 고르는 세 가지 보기 */
export type ViewMode = "all" | "place" | "character";

const MODE_LABELS: Record<ViewMode, string> = {
  all: "시간별",
  place: "공간별",
  character: "인물별",
};

/**
 * 타임라인 뷰 하나에 토글을 얹은 형태(방식 2). 그래프 뷰처럼 리본·명령어로 연다.
 *
 * 렌더러는 모드마다 독립 함수라, 나중에 "뷰 3개를 따로 여는" 방식으로 바꿔도
 * 그대로 쓸 수 있다.
 */
export class TimelineView extends ItemView {
  private plugin: LoreLinePlugin;
  private mode: ViewMode = "all";
  private data: LoreData | null = null;
  /** 로딩이 실패했을 때의 사유. 성공하면 다시 null이 된다. */
  private error: string | null = null;
  /** 경고 목록을 펼쳐 두었는지 */
  private warningsOpen = false;

  /**
   * 축마다 따로 기억하는 감춘 열. 공간별에서 끈 것이 인물별에 영향을 주면
   * 안 되고, 모드를 오갔다고 필터가 풀려도 곤란하다.
   */
  private hidden: Record<"place" | "character", Set<string>> = {
    place: new Set(),
    character: new Set(),
  };

  private toolbarEl!: HTMLElement;
  private bodyEl!: HTMLElement;

  constructor(leaf: WorkspaceLeaf, plugin: LoreLinePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_LORELINE;
  }

  getDisplayText(): string {
    return "LoreLine 타임라인";
  }

  getIcon(): string {
    return "git-branch";
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("loreline-view");

    this.toolbarEl = root.createDiv({ cls: "loreline-toolbar" });
    this.bodyEl = root.createDiv({ cls: "loreline-body" });

    this.renderToolbar();
    await this.reload();
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
  }

  /**
   * 볼트를 다시 훑어 데이터를 새로 만든다. 변경 감지도 이 길로 들어온다.
   *
   * 실패해도 뷰는 서 있어야 한다. 아무것도 없는 화면은 "사건이 없다"와
   * 구별되지 않아서, 사유를 그려 두고 다시 읽을 기회를 남긴다.
   */
  async reload(options: { notify?: boolean } = {}): Promise<void> {
    try {
      this.data = await loadLoreData(this.app, {
        folder: this.plugin.settings.targetFolder,
        configPath: this.plugin.settings.configPath,
        notify: options.notify ?? true,
        cache: this.plugin.scanCache,
      });
      this.error = null;
      this.pruneHidden();
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      console.error("LoreLine: 볼트를 읽지 못했다", error);
    }
    // 경고 개수가 달라졌을 수 있다.
    this.renderToolbar();
    this.renderBody();
  }

  /** 지워지거나 이름이 바뀐 열의 id를 감춘 목록에서 뺀다. */
  private pruneHidden(): void {
    if (!this.data) return;
    for (const axis of ["place", "character"] as const) {
      const lanes = computeLanes(axis, this.data.places, this.data.characters);
      this.hidden[axis] = keepExistingLanes(this.hidden[axis], lanes);
    }
  }

  setMode(mode: ViewMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.renderToolbar();
    // 다른 내용이 오므로 스크롤은 맨 위에서 시작한다.
    this.renderBody({ keepScroll: false });
  }

  private renderToolbar(): void {
    this.toolbarEl.empty();

    const toggle = this.toolbarEl.createDiv({ cls: "loreline-toggle" });
    for (const mode of ["all", "place", "character"] as ViewMode[]) {
      const button = toggle.createEl("button", {
        cls: "loreline-toggle-button",
        text: MODE_LABELS[mode],
      });
      if (mode === this.mode) button.addClass("is-active");
      button.setAttribute("aria-pressed", String(mode === this.mode));
      button.addEventListener("click", () => this.setMode(mode));
    }

    this.renderWarningToggle();

    const refresh = this.toolbarEl.createEl("button", {
      cls: "loreline-refresh",
      text: "다시 읽기",
    });
    refresh.addEventListener("click", () => void this.reload({ notify: false }));
  }

  /**
   * 경고가 있으면 상단에 개수를 띄운다.
   *
   * Notice는 스쳐 지나가고 자동 다시 읽기 때는 아예 뜨지 않는다. 오타 하나로
   * 사건이 엉뚱한 자리에 서 있는 것을 계속 모르고 지나칠 수 있어서, 개수만은
   * 뷰에 남겨 둔다.
   */
  private renderWarningToggle(): void {
    const count = this.data?.warnings.length ?? 0;
    if (count === 0) return;

    const button = this.toolbarEl.createEl("button", {
      cls: "loreline-warn-toggle",
      text: `경고 ${count}`,
    });
    button.setAttribute("aria-expanded", String(this.warningsOpen));
    button.addEventListener("click", () => {
      this.warningsOpen = !this.warningsOpen;
      this.renderToolbar();
      this.renderBody();
    });
  }

  /** 펼친 경고 목록. 본문 맨 위에 붙는다. */
  private renderWarnings(): void {
    const warnings = this.data?.warnings ?? [];
    if (!this.warningsOpen || warnings.length === 0) return;

    const panel = this.bodyEl.createDiv({ cls: "loreline-warnings" });
    const list = panel.createEl("ul");
    for (const warning of warnings) {
      list.createEl("li", { text: warning });
    }
  }

  /**
   * 본문을 다시 그린다.
   *
   * 칩을 누르거나 노트가 바뀌어 다시 그릴 때 맨 위로 튀면 곤란하다. 아래쪽을
   * 훑던 중이었다면 그 자리에 그대로 있어야 한다.
   */
  private renderBody(options: { keepScroll?: boolean } = {}): void {
    const scrollTop = options.keepScroll === false ? 0 : this.bodyEl.scrollTop;
    this.bodyEl.empty();

    if (this.error !== null) {
      this.renderError(this.error);
      return;
    }
    if (!this.data) return;

    this.renderWarnings();


    if (this.mode === "all") {
      renderTime(this.bodyEl, this.app, this.data);
      this.bodyEl.scrollTop = scrollTop;
      return;
    }

    const axis = this.mode;
    renderGrid(this.bodyEl, this.app, this.data, axis, {
      hidden: this.hidden[axis],
      onToggle: (laneId) => {
        const hidden = this.hidden[axis];
        if (hidden.has(laneId)) hidden.delete(laneId);
        else hidden.add(laneId);
        this.renderBody();
      },
      onShowAll: () => {
        this.hidden[axis].clear();
        this.renderBody();
      },
    });
    this.bodyEl.scrollTop = scrollTop;
  }

  private renderError(message: string): void {
    const box = this.bodyEl.createDiv({ cls: "loreline-error" });
    box.createDiv({ cls: "loreline-error-title", text: "볼트를 읽지 못했다." });
    box.createDiv({ cls: "loreline-error-detail", text: message });

    const retry = box.createEl("button", { text: "다시 읽기" });
    retry.addEventListener("click", () => void this.reload({ notify: true }));

    renderEmpty(box, "설정에서 대상 폴더와 정의 파일 경로를 확인해 보라.");
  }
}
