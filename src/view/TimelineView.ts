import { ItemView, type WorkspaceLeaf } from "obsidian";

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
    } catch (error) {
      this.error = error instanceof Error ? error.message : String(error);
      console.error("LoreLine: 볼트를 읽지 못했다", error);
    }
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
      button.setAttribute("aria-pressed", String(mode === this.mode));
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

    if (this.error !== null) {
      this.renderError(this.error);
      return;
    }
    if (!this.data) return;

    if (this.mode === "all") {
      renderTime(this.bodyEl, this.app, this.data);
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
