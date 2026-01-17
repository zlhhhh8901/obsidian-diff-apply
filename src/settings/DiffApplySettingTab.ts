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

    containerEl.createEl("h2", { text: "Diff Apply 插件设置" });

    new Setting(containerEl)
      .setName("字体大小")
      .setDesc("设置编辑器中的字体大小（像素）")
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
      .setName("默认差异视图位置")
      .setDesc("设置打开差异视图时的默认显示位置")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("left", "左侧")
          .addOption("center", "中间")
          .addOption("right", "右侧")
          .setValue(this.plugin.settings.defaultDiffPosition)
          .onChange(async (value) => {
            this.plugin.settings.defaultDiffPosition = value as
              | "left"
              | "center"
              | "right";
            await this.plugin.saveSettings();
          })
      );

    containerEl.createEl("h3", { text: "快捷键说明" });
    const shortcutList = containerEl.createEl("ul");
    shortcutList.createEl("li", { text: "Cmd/Ctrl + , : 差异视图位置左移" });
    shortcutList.createEl("li", { text: "Cmd/Ctrl + . : 差异视图位置右移" });
    shortcutList.createEl("li", { text: "Cmd/Ctrl + / : 切换差异视图显示/隐藏" });
    shortcutList.createEl("li", { text: "Enter : 复制选中文本到编辑器" });
    shortcutList.createEl("li", { text: "双击只读栏任意非空行：复制该行到编辑器" });
    shortcutList.createEl("li", { text: "Cmd/Ctrl + Z : 撤销编辑" });
  }
}
