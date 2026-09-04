import { PluginSettingTab, Setting, type App } from "obsidian";

import type LoreLinePlugin from "./main";

export type LoreLineSettings = {
  /** 스캔 대상 폴더. 빈 문자열이면 볼트 전체 */
  targetFolder: string;
  /** 색·순서 정의 파일의 볼트 경로 */
  configPath: string;
  /** 노트가 바뀌면 뷰를 다시 그릴지 */
  autoReload: boolean;
};

export const DEFAULT_SETTINGS: LoreLineSettings = {
  targetFolder: "",
  configPath: "loreline.config.json",
  autoReload: true,
};

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
      .setName("대상 폴더")
      .setDesc("사건·인물·장소 노트를 찾을 폴더. 비워 두면 볼트 전체를 훑는다.")
      .addText((text) =>
        text
          .setPlaceholder("예: 핀타디네")
          .setValue(this.plugin.settings.targetFolder)
          .onChange(async (value) => {
            // 앞뒤 슬래시를 모두 벗긴다. 볼트 경로는 "/"로 시작하지 않아서,
            // "/핀타디네"라고 적으면 어떤 파일도 안 걸리고 빈 화면이 된다.
            this.plugin.settings.targetFolder = value.trim().replace(/^\/+|\/+$/g, "");
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("정의 파일 경로")
      .setDesc("색과 순서를 담은 JSON. 볼트 최상위에서부터의 경로로 적는다.")
      .addText((text) =>
        text
          .setPlaceholder("loreline.config.json")
          .setValue(this.plugin.settings.configPath)
          .onChange(async (value) => {
            this.plugin.settings.configPath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("자동 다시 읽기")
      .setDesc("노트나 정의 파일이 바뀌면 열려 있는 타임라인을 다시 그린다.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoReload).onChange(async (value) => {
          this.plugin.settings.autoReload = value;
          await this.plugin.saveSettings();
        }),
      );
  }
}
