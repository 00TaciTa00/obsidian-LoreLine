import { ItemView, type WorkspaceLeaf } from "obsidian";

import { loadLoreData } from "../loader/load";
import type { LoreData } from "../lib/types";
import { renderGrid } from "./renderGrid";
import { renderTime } from "./renderTime";

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

  /** 볼트를 다시 훑어 데이터를 새로 만든다. 변경 감지도 이 길로 들어온다. */
  async reload(options: { notify?: boolean } = {}): Promise<void> {
    this.data = await loadLoreData(this.app, {
      folder: this.plugin.settings.targetFolder,
      configPath: this.plugin.settings.configPath,
      notify: options.notify ?? true,
    });
    this.renderBody();
  }

  setMode(mode: ViewMode): void {
    if (this.mode === mode) return;
    this.mode = mode;
    this.renderToolbar();
    this.renderBody();
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
      button.addEventListener("click", () => this.setMode(mode));
    }

    const refresh = this.toolbarEl.createEl("button", {
      cls: "loreline-refresh",
      text: "다시 읽기",
    });
    // 손으로 눌렀을 때는 경고를 다시 보여 준다.
    refresh.addEventListener("click", () => void this.reload({ notify: true }));
  }

  private renderBody(): void {
    this.bodyEl.empty();
    if (!this.data) return;

    if (this.mode === "all") {
      renderTime(this.bodyEl, this.app, this.data);
      return;
    }
    renderGrid(this.bodyEl, this.app, this.data, this.mode);
  }
}
