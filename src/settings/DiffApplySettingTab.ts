import { App, PluginSettingTab, Setting } from "obsidian";
import type DiffApplyPlugin from "../main";

export class DiffApplySettingTab extends PluginSettingTab {
  private plugin: DiffApplyPlugin;

  constructor(app: App, plugin: DiffApplyPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    containerEl.createEl("h2", { text: this.plugin.t("settings.title") });

    new Setting(containerEl)
      .setName(this.plugin.t("settings.language.name"))
      .setDesc(this.plugin.t("settings.language.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("auto", this.plugin.t("settings.language.option.auto"))
          .addOption("en", this.plugin.t("settings.language.option.en"))
          .addOption("zh", this.plugin.t("settings.language.option.zh"))
          .setValue(this.plugin.settings.language)
          .onChange(async (value) => {
            this.plugin.settings.language = value as "auto" | "en" | "zh";
            await this.plugin.saveSettings();
            this.display();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settings.fontSize.name"))
      .setDesc(this.plugin.t("settings.fontSize.desc"))
      .addSlider((slider) =>
        slider
          .setLimits(10, 24, 1)
          .setValue(this.plugin.settings.fontSize)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.fontSize = value;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settings.defaultDiffPosition.name"))
      .setDesc(this.plugin.t("settings.defaultDiffPosition.desc"))
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left", this.plugin.t("settings.defaultDiffPosition.option.left"))
          .addOption("center", this.plugin.t("settings.defaultDiffPosition.option.center"))
          .addOption("right", this.plugin.t("settings.defaultDiffPosition.option.right"))
          .setValue(this.plugin.settings.defaultDiffPosition)
          .onChange(async (value) => {
            this.plugin.settings.defaultDiffPosition = value as
              | "left"
              | "center"
              | "right";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName(this.plugin.t("settings.smartDblClickInsertNewlines.name"))
      .setDesc(this.plugin.t("settings.smartDblClickInsertNewlines.desc"))
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.smartDblClickInsertNewlines)
          .onChange(async (value) => {
            this.plugin.settings.smartDblClickInsertNewlines = value;
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: this.plugin.t("settings.shortcuts.title") });
    const shortcutList = containerEl.createEl("ul");
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.moveLeft") });
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.moveRight") });
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.toggleDiff") });
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.enter") });
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.dblClick") });
    shortcutList.createEl("li", { text: this.plugin.t("settings.shortcuts.undo") });
  }
}
