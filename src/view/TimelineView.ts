import { ItemView, type ViewStateResult, type WorkspaceLeaf } from "obsidian";

import { computeLanes, keepExistingLanes } from "../lib/lanes";
import type { LoreData } from "../lib/types";
import { loadLoreData } from "../loader/load";
import type { World } from "../loader/worlds";
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
 * 탭에 저장되는 것. 옵시디언이 workspace.json에 넣었다가 다음에 돌려준다.
 *
 * 세계가 여기 실리기 때문에 탭마다 다른 세계를 볼 수 있고, 재시작해도 보던
 * 것으로 돌아온다. 보기 모드와 감춘 열도 같이 태운다.
 */
type PersistedState = {
  world: World | null;
  mode: ViewMode;
  hidden: { place: string[]; character: string[] };
};

function isViewMode(value: unknown): value is ViewMode {
  return value === "all" || value === "place" || value === "character";
}

/** 저장된 것이 우리가 넣은 모양인지 확인하고 World로 되살린다. */
function toWorld(value: unknown): World | null {
  if (typeof value !== "object" || value === null) return null;

  const record = value as Record<string, unknown>;
  if (typeof record.folder !== "string") return null;
  if (typeof record.configPath !== "string") return null;
  if (typeof record.name !== "string") return null;

  return { folder: record.folder, configPath: record.configPath, name: record.name };
}

function toIdSet(value: unknown): Set<string> {
  if (!Array.isArray(value)) return new Set();
  return new Set(value.filter((id): id is string => typeof id === "string"));
}

/**
 * 타임라인 뷰 하나에 토글을 얹은 형태(방식 2). 그래프 뷰처럼 리본·명령어로 연다.
 *
 * 뷰 하나가 세계 하나를 본다. 여러 세계를 같이 보려면 탭을 여러 개 연다.
 * 렌더러는 모드마다 독립 함수라 나중에 뷰를 나눠도 그대로 쓴다.
 */
export class TimelineView extends ItemView {
  private plugin: LoreLinePlugin;
  private mode: ViewMode = "all";
  private data: LoreData | null = null;
  /** 이 탭이 보는 세계. 아직 안 고른 탭도 있을 수 있다. */
  private world: World | null = null;
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

  /**
   * 격자 카드 중 칩을 다 펼쳐 둔 사건의 id. 탭에 저장하지는 않는다 — 잠깐
   * 들여다보려고 펼치는 것이라 재시작 뒤까지 남길 이유가 없다.
   */
  private expandedChips = new Set<string>();

  private toolbarEl: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: LoreLinePlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return VIEW_TYPE_LORELINE;
  }

  /** 탭에 찍히는 이름. 세계가 여럿이면 이것으로 구별한다. */
  getDisplayText(): string {
    return this.world ? `LoreLine — ${this.world.name}` : "LoreLine 타임라인";
  }

  getIcon(): string {
    return "git-branch";
  }

  /** 이 탭이 보고 있는 세계. 플러그인이 탭을 찾을 때 쓴다. */
  get shownWorld(): World | null {
    return this.world;
  }

  getState(): Record<string, unknown> {
    const state: PersistedState = {
      world: this.world,
      mode: this.mode,
      hidden: {
        place: [...this.hidden.place],
        character: [...this.hidden.character],
      },
    };
    return state as unknown as Record<string, unknown>;
  }

  /**
   * 옵시디언이 저장해 둔 것을 돌려준다. 탭을 열 때와 복원할 때 모두 불린다.
   *
   * onOpen보다 먼저 올 수도, 나중에 올 수도 있다. 껍데기가 아직 없으면 값만
   * 받아 두고, onOpen이 그때 그린다.
   */
  async setState(state: unknown, result: ViewStateResult): Promise<void> {
    const record = (state ?? {}) as Record<string, unknown>;

    const next = toWorld(record.world);
    const changed = next !== null && next.folder !== this.world?.folder;

    if (next) this.world = next;
    if (isViewMode(record.mode)) this.mode = record.mode;

    const hidden = record.hidden as Record<string, unknown> | undefined;
    if (hidden) {
      this.hidden = { place: toIdSet(hidden.place), character: toIdSet(hidden.character) };
    }

    await super.setState(state, result);

    if (!this.bodyEl) return;
    if (changed) {
      await this.reload({ notify: false });
      return;
    }
    this.renderToolbar();
    this.renderBody({ keepScroll: false });
  }

  async onOpen(): Promise<void> {
    const root = this.contentEl;
    root.empty();
    root.addClass("loreline-view");

    this.toolbarEl = root.createDiv({ cls: "loreline-toolbar" });
    this.bodyEl = root.createDiv({ cls: "loreline-body" });

    this.renderToolbar();
    await this.reload({ notify: false });
  }

  async onClose(): Promise<void> {
    this.contentEl.empty();
    this.toolbarEl = null;
    this.bodyEl = null;
  }

  /** 이 탭을 다른 세계로 돌린다. */
  async showWorld(world: World): Promise<void> {
    this.world = world;
    // 세계가 달라지면 감춘 열의 id도 남의 것이 된다.
    this.hidden = { place: new Set(), character: new Set() };
    await this.reload({ notify: true });
  }

  /**
   * 볼트를 다시 훑어 데이터를 새로 만든다. 변경 감지도 이 길로 들어온다.
   *
   * 실패해도 뷰는 서 있어야 한다. 아무것도 없는 화면은 "사건이 없다"와
   * 구별되지 않아서, 사유를 그려 두고 다시 읽을 기회를 남긴다.
   */
  async reload(options: { notify?: boolean } = {}): Promise<void> {
    if (this.world) {
      try {
        this.data = await loadLoreData(this.app, {
          folder: this.world.folder,
          configPath: this.world.configPath,
          notify: options.notify ?? true,
          cache: this.plugin.caches.for(this.world.folder),
        });
        this.error = null;
        this.pruneHidden();
      } catch (error) {
        this.error = error instanceof Error ? error.message : String(error);
        console.error("LoreLine: 볼트를 읽지 못했다", error);
      }
    }

    // 탭 이름과 상태가 달라졌을 수 있다.
    this.app.workspace.requestSaveLayout();
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
    this.app.workspace.requestSaveLayout();
    this.renderToolbar();
    // 다른 내용이 오므로 스크롤은 맨 위에서 시작한다.
    this.renderBody({ keepScroll: false });
  }

  private renderToolbar(): void {
    if (!this.toolbarEl) return;
    this.toolbarEl.empty();

    // 세계를 아직 안 골랐으면 토글이 가리킬 것이 없다.
    if (!this.world) return;

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

    const swap = this.toolbarEl.createEl("button", {
      cls: "loreline-world-switch",
      text: this.world.name,
    });
    swap.setAttribute("aria-label", "다른 세계 고르기");
    swap.addEventListener("click", () => this.plugin.pickWorldFor(this));

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
    if (!this.toolbarEl) return;

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
    if (!this.bodyEl) return;

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
    if (!this.bodyEl) return;

    const scrollTop = options.keepScroll === false ? 0 : this.bodyEl.scrollTop;
    this.bodyEl.empty();

    if (!this.world) {
      this.renderNoWorld();
      return;
    }
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
        this.app.workspace.requestSaveLayout();
        this.renderBody();
      },
      onShowAll: () => {
        this.hidden[axis].clear();
        this.app.workspace.requestSaveLayout();
        this.renderBody();
      },
      expanded: this.expandedChips,
      onToggleChips: (eventId) => {
        if (!this.expandedChips.delete(eventId)) this.expandedChips.add(eventId);
        this.renderBody();
      },
    });
    this.bodyEl.scrollTop = scrollTop;
  }

  /** 세계를 아직 안 고른 탭. 재시작 뒤 상태가 비어 돌아왔을 때도 여기로 온다. */
  private renderNoWorld(): void {
    if (!this.bodyEl) return;

    const box = this.bodyEl.createDiv({ cls: "loreline-error" });
    box.createDiv({ cls: "loreline-error-title", text: "볼 세계를 고르지 않았다." });

    const buttons = box.createDiv({ cls: "loreline-button-row" });

    const pick = buttons.createEl("button", { cls: "mod-cta", text: "세계 고르기" });
    pick.addEventListener("click", () => this.plugin.pickWorldFor(this));

    const create = buttons.createEl("button", { text: "새 세계 만들기" });
    create.addEventListener("click", () => this.plugin.promptCreateWorld(""));

    renderEmpty(box, "loreline.config.json이 놓인 폴더가 하나의 세계가 된다.");
  }

  private renderError(message: string): void {
    if (!this.bodyEl) return;

    const box = this.bodyEl.createDiv({ cls: "loreline-error" });
    box.createDiv({ cls: "loreline-error-title", text: "볼트를 읽지 못했다." });
    box.createDiv({ cls: "loreline-error-detail", text: message });

    const retry = box.createEl("button", { text: "다시 읽기" });
    retry.addEventListener("click", () => void this.reload({ notify: true }));

    renderEmpty(box, "세계 폴더와 정의 파일이 그대로 있는지 확인해 보라.");
  }
}
