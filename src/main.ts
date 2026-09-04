import { Plugin, type WorkspaceLeaf } from "obsidian";

import { DEFAULT_SETTINGS, LoreLineSettingTab, type LoreLineSettings } from "./settings";
import { TimelineView, VIEW_TYPE_LORELINE } from "./view/TimelineView";

/** 변경이 몰아쳐도 다시 읽기는 한 번만 돌게 하는 간격 */
const RELOAD_DEBOUNCE_MS = 500;

export default class LoreLinePlugin extends Plugin {
  settings: LoreLineSettings = DEFAULT_SETTINGS;

  private reloadTimer: number | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_LORELINE,
      (leaf: WorkspaceLeaf) => new TimelineView(leaf, this),
    );

    this.addRibbonIcon("git-branch", "LoreLine 타임라인 열기", () => {
      void this.activateView();
    });

    this.addCommand({
      id: "open-timeline",
      name: "타임라인 열기",
      callback: () => void this.activateView(),
    });

    this.addCommand({
      id: "reload-timeline",
      name: "타임라인 다시 읽기",
      callback: () => void this.reloadViews({ notify: true }),
    });

    this.addSettingTab(new LoreLineSettingTab(this.app, this));

    this.registerVaultWatchers();
  }

  onunload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    // 대상 폴더나 정의 파일 경로가 바뀌면 지금 보이는 것이 옛것이 된다.
    await this.reloadViews({ notify: false });
  }

  /** 이미 열려 있으면 그 탭으로 가고, 없으면 오른쪽에 새로 연다. */
  async activateView(): Promise<void> {
    const { workspace } = this.app;

    const existing = workspace.getLeavesOfType(VIEW_TYPE_LORELINE);
    if (existing.length > 0) {
      await workspace.revealLeaf(existing[0]);
      return;
    }

    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({ type: VIEW_TYPE_LORELINE, active: true });
    await workspace.revealLeaf(leaf);
  }

  /** 열려 있는 타임라인 뷰를 모두 다시 그린다. */
  async reloadViews(options: { notify: boolean }): Promise<void> {
    const leaves = this.app.workspace.getLeavesOfType(VIEW_TYPE_LORELINE);
    for (const leaf of leaves) {
      const view = leaf.view;
      if (view instanceof TimelineView) {
        await view.reload({ notify: options.notify });
      }
    }
  }

  /**
   * 노트·정의 파일 변경 감지.
   *
   * frontmatter는 metadataCache가 파싱을 마친 뒤에야 최신이므로 vault.modify가
   * 아니라 metadataCache.changed를 듣는다. 정의 파일은 .md가 아니라
   * metadataCache를 타지 않으니 vault 쪽도 함께 듣는다.
   */
  private registerVaultWatchers(): void {
    const schedule = () => {
      if (!this.settings.autoReload) return;
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
      // 자동 다시 읽기에서는 Notice를 띄우지 않는다. 타이핑 중에 경고가 쌓인다.
      this.reloadTimer = window.setTimeout(() => {
        this.reloadTimer = null;
        void this.reloadViews({ notify: false });
      }, RELOAD_DEBOUNCE_MS);
    };

    this.registerEvent(this.app.metadataCache.on("changed", schedule));
    this.registerEvent(this.app.vault.on("create", schedule));
    this.registerEvent(this.app.vault.on("delete", schedule));
    this.registerEvent(this.app.vault.on("rename", schedule));
    this.registerEvent(this.app.vault.on("modify", schedule));
  }
}
