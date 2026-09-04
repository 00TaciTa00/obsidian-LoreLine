import { PluginSettingTab, Setting, type App } from "obsidian";

import { CONFIG_FILE_NAME } from "./loader/config";
import { findWorlds } from "./loader/worlds";

import type LoreLinePlugin from "./main";

export type LoreLineSettings = {
  /** 노트가 바뀌면 뷰를 다시 그릴지 */
  autoReload: boolean;
};

export const DEFAULT_SETTINGS: LoreLineSettings = {
  autoReload: true,
};

/**
 * 저장된 값에서 아는 것만 골라 낸다.
 *
 * 예전 판에는 대상 폴더와 정의 파일 경로가 설정에 있었다. 지금은 정의 파일이
 * 놓인 자리가 곧 세계라 설정에 둘 것이 없다. 남은 키는 흘려보낸다.
 */
export function normalizeSettings(raw: unknown): LoreLineSettings {
  if (typeof raw !== "object" || raw === null) return { ...DEFAULT_SETTINGS };

  const record = raw as Record<string, unknown>;
  return {
    autoReload:
      typeof record.autoReload === "boolean" ? record.autoReload : DEFAULT_SETTINGS.autoReload,
  };
}

export class LoreLineSettingTab extends PluginSettingTab {
  private plugin: LoreLinePlugin;

  constructor(app: App, plugin: LoreLinePlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("자동 다시 읽기")
      .setDesc("노트나 정의 파일이 바뀌면 열려 있는 타임라인을 다시 그린다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoReload).onChange(async (value) => {
          this.plugin.settings.autoReload = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl).setName("세계").setHeading();

    const list = containerEl.createDiv({ cls: "loreline-world-list" });
    list.createEl("p", {
      cls: "setting-item-description",
      text: `${CONFIG_FILE_NAME}이 놓인 폴더가 하나의 세계가 된다. 새 세계를 만들려면 그 폴더에 이 파일을 두면 된다 (내용이 "{}" 한 줄이어도 된다).`,
    });

    // 목록은 볼트를 읽어야 알 수 있어 설정 탭을 열 때마다 새로 찾는다.
    void this.renderWorlds(list);
  }

  private async renderWorlds(parent: HTMLElement): Promise<void> {
    const worlds = await findWorlds(this.app);

    if (worlds.length === 0) {
      parent.createEl("p", {
        cls: "loreline-world-empty",
        text: "찾은 세계가 없다.",
      });
      return;
    }

    const list = parent.createEl("ul", { cls: "loreline-world-items" });
    for (const world of worlds) {
      const item = list.createEl("li");
      item.createSpan({ cls: "loreline-world-name", text: world.name });
      item.createSpan({ cls: "loreline-world-path", text: world.folder || "(볼트 최상위)" });
    }
  }
}
