import { FuzzySuggestModal, Modal, Setting, TFolder, type App } from "obsidian";

import { CONFIG_FILE_NAME } from "../loader/config";
import { normalizeFolderPath } from "../loader/create-world";

/** 볼트의 폴더를 훑어 고르는 목록. 경로를 손으로 다 적지 않아도 되게 한다. */
class FolderSuggestModal extends FuzzySuggestModal<TFolder> {
  private onChoose: (folder: TFolder) => void;

  constructor(app: App, onChoose: (folder: TFolder) => void) {
    super(app);
    this.onChoose = onChoose;
    this.setPlaceholder("세계를 둘 폴더");
  }

  getItems(): TFolder[] {
    return this.app.vault
      .getAllLoadedFiles()
      .filter((file): file is TFolder => file instanceof TFolder)
      .filter((folder) => folder.path !== "/");
  }

  getItemText(folder: TFolder): string {
    return folder.path;
  }

  onChooseItem(folder: TFolder): void {
    this.onChoose(folder);
  }
}

export type CreateWorldRequest = { folder: string; name: string };

/**
 * 새 세계를 만들 자리를 묻는 창.
 *
 * 폴더는 있는 것을 골라도 되고 없는 이름을 적어도 된다(그러면 만든다).
 * 만드는 일 자체는 여기서 하지 않고 부르는 쪽에 넘긴다 — 오류를 어디에
 * 보여줄지는 창이 정할 일이 아니다.
 */
export class CreateWorldModal extends Modal {
  private folder: string;
  private name = "";
  private onSubmit: (request: CreateWorldRequest) => Promise<string | null>;

  private errorEl: HTMLElement | null = null;

  /**
   * @param folder 미리 채워 둘 폴더 (폴더를 우클릭해 들어온 경우)
   * @param onSubmit 만들기를 누르면 불린다. 오류 문구를 돌려주면 창에 띄우고
   *                 창을 닫지 않는다. null이면 성공으로 보고 닫는다.
   */
  constructor(
    app: App,
    folder: string,
    onSubmit: (request: CreateWorldRequest) => Promise<string | null>,
  ) {
    super(app);
    this.folder = folder;
    this.onSubmit = onSubmit;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass("loreline-create-world");

    contentEl.createEl("h3", { text: "새 세계 만들기" });
    contentEl.createEl("p", {
      cls: "setting-item-description",
      text: `고른 폴더에 ${CONFIG_FILE_NAME}을 만든다. 그 폴더 아래의 노트만 이 세계에 들어간다.`,
    });

    let folderInput: HTMLInputElement | null = null;

    new Setting(contentEl)
      .setName("폴더")
      .setDesc("없는 폴더를 적으면 만든다.")
      .addText((text) => {
        folderInput = text.inputEl;
        text
          .setPlaceholder("예: 핀타디네")
          .setValue(this.folder)
          .onChange((value) => {
            this.folder = value;
          });
      })
      .addExtraButton((button) =>
        button
          .setIcon("folder")
          .setTooltip("있는 폴더에서 고르기")
          .onClick(() => {
            new FolderSuggestModal(this.app, (folder) => {
              this.folder = folder.path;
              if (folderInput) folderInput.value = folder.path;
            }).open();
          }),
      );

    new Setting(contentEl)
      .setName("이름")
      .setDesc("비워 두면 폴더명을 쓴다.")
      .addText((text) =>
        text.setPlaceholder("(폴더명)").onChange((value) => {
          this.name = value;
        }),
      );

    this.errorEl = contentEl.createDiv({ cls: "loreline-modal-error" });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("만들기")
          .setCta()
          .onClick(() => void this.submit()),
      )
      .addButton((button) => button.setButtonText("취소").onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.errorEl = null;
  }

  private showError(message: string): void {
    if (this.errorEl) this.errorEl.setText(message);
  }

  private async submit(): Promise<void> {
    const folder = normalizeFolderPath(this.folder);
    if (!folder) {
      this.showError("세계를 둘 폴더를 적으라.");
      return;
    }

    const error = await this.onSubmit({ folder, name: this.name.trim() });
    if (error) {
      this.showError(error);
      return;
    }
    this.close();
  }
}
