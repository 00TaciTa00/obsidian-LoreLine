import { FuzzySuggestModal, Notice, Plugin, TFolder, type Menu, type TAbstractFile, type WorkspaceLeaf } from "obsidian";

import { CONFIG_FILE_NAME } from "./loader/config";
import { createWorld } from "./loader/create-world";
import { ScanCaches, touchesFolder } from "./loader/scan";
import { findWorlds, type World } from "./loader/worlds";
import { DEFAULT_SETTINGS, LoreLineSettingTab, normalizeSettings, type LoreLineSettings } from "./settings";
import { CreateWorldModal } from "./view/CreateWorldModal";
import { TimelineView, VIEW_TYPE_LORELINE } from "./view/TimelineView";

/** 변경이 몰아쳐도 다시 읽기는 한 번만 돌게 하는 간격 */
const RELOAD_DEBOUNCE_MS = 500;

/** 세계가 여럿일 때 무엇을 열지 고르는 목록 */
class WorldSuggestModal extends FuzzySuggestModal<World> {
  private worlds: World[];
  private onChoose: (world: World) => void;

  constructor(plugin: LoreLinePlugin, worlds: World[], onChoose: (world: World) => void) {
    super(plugin.app);
    this.worlds = worlds;
    this.onChoose = onChoose;
    this.setPlaceholder("볼 세계를 고르라");
  }

  getItems(): World[] {
    return this.worlds;
  }

  getItemText(world: World): string {
    // 이름이 겹칠 수 있으니 폴더까지 검색에 걸리게 한다.
    return world.folder ? `${world.name} (${world.folder})` : world.name;
  }

  onChooseItem(world: World): void {
    this.onChoose(world);
  }
}

export default class LoreLinePlugin extends Plugin {
  settings: LoreLineSettings = DEFAULT_SETTINGS;

  /**
   * 세계마다 따로 두는 스캔 캐시.
   *
   * 뷰가 아니라 플러그인이 들고 있어야 탭을 닫았다 열어도 남고, 같은 세계를
   * 보는 탭 둘이 같은 것을 쓴다.
   */
  readonly caches = new ScanCaches();

  private reloadTimer: number | null = null;
  /** 다음 다시 읽기까지 쌓인, 바뀐 파일들의 경로 */
  private dirtyPaths = new Set<string>();

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(
      VIEW_TYPE_LORELINE,
      (leaf: WorkspaceLeaf) => new TimelineView(leaf, this),
    );

    this.addRibbonIcon("git-branch", "LoreLine 타임라인 열기", () => {
      void this.openTimeline();
    });

    this.addCommand({
      id: "open-timeline",
      name: "타임라인 열기",
      callback: () => void this.openTimeline(),
    });

    this.addCommand({
      id: "open-timeline-pick",
      name: "세계를 골라 새 탭에서 열기",
      callback: () => void this.openTimeline({ alwaysAsk: true }),
    });

    this.addCommand({
      id: "create-world",
      name: "새 세계 만들기",
      callback: () => this.promptCreateWorld(""),
    });

    this.addCommand({
      id: "reload-timeline",
      name: "타임라인 다시 읽기",
      callback: () => void this.reloadAll({ notify: true }),
    });

    this.addSettingTab(new LoreLineSettingTab(this.app, this));

    this.registerVaultWatchers();
    this.registerFolderMenu();
  }

  onunload(): void {
    if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);
  }

  async loadSettings(): Promise<void> {
    this.settings = normalizeSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /**
   * 타임라인을 연다.
   *
   * 세계가 하나뿐이면 묻지 않는다. 매번 고르게 하면 대부분의 볼트에서 쓸데없는
   * 한 단계가 된다.
   */
  async openTimeline(options: { alwaysAsk?: boolean } = {}): Promise<void> {
    const worlds = await findWorlds(this.app);

    if (worlds.length === 0) {
      // 안내만 하고 끝내면 다음 할 일을 스스로 찾아야 한다. 만들 자리를 바로 묻는다.
      new Notice("LoreLine: 아직 세계가 없다. 하나 만들자.");
      this.promptCreateWorld("");
      return;
    }

    if (worlds.length === 1 && !options.alwaysAsk) {
      await this.revealWorld(worlds[0]);
      return;
    }

    new WorldSuggestModal(this, worlds, (world) => void this.revealWorld(world)).open();
  }

  /** 열려 있는 뷰의 세계를 바꾼다. 툴바의 세계 이름을 눌렀을 때. */
  async pickWorldFor(view: TimelineView): Promise<void> {
    const worlds = await findWorlds(this.app);

    if (worlds.length === 0) {
      new Notice("LoreLine: 아직 세계가 없다. 하나 만들자.");
      this.promptCreateWorld("");
      return;
    }

    new WorldSuggestModal(this, worlds, (world) => void view.showWorld(world)).open();
  }

  /**
   * 새 세계를 만들 자리를 묻고, 만들고, 바로 연다.
   *
   * 만들기가 실패하면 사유를 창에 돌려주고 창은 열어 둔다. 이미 세계인 폴더를
   * 골랐을 때 창이 닫혀 버리면 무엇이 잘못됐는지 알 수 없다.
   */
  promptCreateWorld(folder: string): void {
    new CreateWorldModal(this.app, folder, async (request) => {
      try {
        const world = await createWorld(this.app, request);
        new Notice(`LoreLine: 세계 "${world.name}"을 만들었다.`);
        await this.revealWorld(world);
        return null;
      } catch (error) {
        return error instanceof Error ? error.message : String(error);
      }
    }).open();
  }

  /** 그 폴더가 이미 세계인지 (정의 파일이 있는지) */
  private isWorldFolder(folder: TFolder): boolean {
    const path = folder.path === "/" ? CONFIG_FILE_NAME : `${folder.path}/${CONFIG_FILE_NAME}`;
    return this.app.vault.getAbstractFileByPath(path) !== null;
  }

  /**
   * 폴더 우클릭 메뉴.
   *
   * 세계를 만드는 자리가 곧 폴더이므로, 폴더에서 시작하는 것이 가장 짧다.
   * 이미 세계인 폴더에서는 만들기 대신 열기를 준다.
   */
  private registerFolderMenu(): void {
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu: Menu, file: TAbstractFile) => {
        if (!(file instanceof TFolder)) return;

        if (this.isWorldFolder(file)) {
          menu.addItem((item) =>
            item
              .setTitle("LoreLine 타임라인 열기")
              .setIcon("git-branch")
              .onClick(() => void this.openFolderWorld(file)),
          );
          return;
        }

        menu.addItem((item) =>
          item
            .setTitle("여기에 LoreLine 세계 만들기")
            .setIcon("git-branch")
            .onClick(() => this.promptCreateWorld(file.path === "/" ? "" : file.path)),
        );
      }),
    );
  }

  /** 우클릭한 폴더의 세계를 연다. */
  private async openFolderWorld(folder: TFolder): Promise<void> {
    const wanted = folder.path === "/" ? "" : folder.path;
    const world = (await findWorlds(this.app)).find((candidate) => candidate.folder === wanted);

    if (!world) {
      new Notice("LoreLine: 그 폴더의 세계를 찾지 못했다.");
      return;
    }
    await this.revealWorld(world);
  }

  /** 그 세계를 보는 탭이 이미 있으면 그리로 가고, 없으면 새로 연다. */
  async revealWorld(world: World): Promise<void> {
    const { workspace } = this.app;

    const open = this.timelineViews().find(
      (view) => view.shownWorld?.folder === world.folder,
    );
    if (open) {
      await workspace.revealLeaf(open.leaf);
      return;
    }

    const leaf = workspace.getLeaf("tab");
    await leaf.setViewState({
      type: VIEW_TYPE_LORELINE,
      active: true,
      state: { world, mode: "all", hidden: { place: [], character: [] } },
    });
    await workspace.revealLeaf(leaf);
  }

  /** 열려 있는 타임라인 뷰 전부 */
  private timelineViews(): TimelineView[] {
    return this.app.workspace
      .getLeavesOfType(VIEW_TYPE_LORELINE)
      .map((leaf) => leaf.view)
      .filter((view): view is TimelineView => view instanceof TimelineView);
  }

  /**
   * 뷰를 다시 그린다.
   *
   * `paths`를 주면 그 파일을 품은 세계의 뷰만 다시 읽는다. 세계 넷을 열어 두고
   * 한 곳의 노트를 고쳤을 뿐인데 넷을 다 훑을 이유가 없다.
   *
   * 뷰 하나가 넘어져도 나머지는 갱신되어야 한다. 뷰 안에서 이미 한 번 잡지만,
   * 그 바깥에서 터지는 것까지 여기서 막는다.
   */
  async reloadAll(options: { notify: boolean; paths?: Set<string> }): Promise<void> {
    for (const view of this.timelineViews()) {
      const folder = view.shownWorld?.folder;
      if (folder === undefined) continue;
      if (options.paths && !touchesFolder(options.paths, folder)) continue;

      try {
        await view.reload({ notify: options.notify });
      } catch (error) {
        console.error("LoreLine: 뷰를 다시 그리지 못했다", error);
        if (options.notify) new Notice("LoreLine: 타임라인을 다시 읽지 못했다.");
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
    const schedule = (...paths: string[]) => {
      if (!this.settings.autoReload) return;

      for (const path of paths) this.dirtyPaths.add(path);
      if (this.reloadTimer !== null) window.clearTimeout(this.reloadTimer);

      this.reloadTimer = window.setTimeout(() => {
        this.reloadTimer = null;
        const paths = this.dirtyPaths;
        this.dirtyPaths = new Set();
        // 자동 다시 읽기에서는 Notice를 띄우지 않는다. 타이핑 중에 경고가 쌓인다.
        void this.reloadAll({ notify: false, paths });
      }, RELOAD_DEBOUNCE_MS);
    };

    this.registerEvent(this.app.metadataCache.on("changed", (file) => schedule(file.path)));
    this.registerEvent(this.app.vault.on("create", (file) => schedule(file.path)));
    this.registerEvent(this.app.vault.on("delete", (file) => schedule(file.path)));
    this.registerEvent(this.app.vault.on("modify", (file) => schedule(file.path)));
    this.registerEvent(
      // 이름이 바뀌면 옛 자리와 새 자리 양쪽 세계가 달라진다.
      this.app.vault.on("rename", (file, oldPath) => schedule(file.path, oldPath)),
    );
  }
}
