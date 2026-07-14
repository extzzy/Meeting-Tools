const { PluginSettingTab, Setting } = require("obsidian");
const { BUILTIN_TEMPLATE_FILENAME } = require("./services");

class MeetingToolsSettingTab extends PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  getControlValue(key) {
    return this.plugin.settings[key];
  }

  async setControlValue(key, value) {
    const trimmedKeys = new Set([
      "templateFolder",
      "rootFolder",
      "meetingLogFolder",
      "meetingLogFlatFilename",
      "taskFolder",
      "taskInboxFile"
    ]);
    const normalized = trimmedKeys.has(key) && typeof value === "string" ? value.trim() : value;
    await this.plugin.updateSettings({ [key]: normalized });
    if (key === "language") this.update();
  }

  getSettingDefinitions() {
    const t = (key, variables) => this.plugin.t(key, variables);
    const templateFiles = this.app.vault.getMarkdownFiles()
      .filter((file) => file.parent?.path === this.plugin.settings.templateFolder)
      .sort((left, right) => left.name.localeCompare(right.name, this.plugin.language));
    const templateOptions = Object.fromEntries(templateFiles.map((file) => [file.name, file.basename]));
    templateOptions[BUILTIN_TEMPLATE_FILENAME] = t("builtin.name");
    const preset = this.plugin.settings.preset;
    if (preset && preset !== BUILTIN_TEMPLATE_FILENAME && !templateFiles.some((file) => file.name === preset)) {
      templateOptions[preset] = t("settings.notFound", { name: preset });
    }

    const text = (key, placeholder) => ({ type: "text", key, placeholder });
    const toggle = (key) => ({ type: "toggle", key });
    const dropdown = (key, options) => ({ type: "dropdown", key, options });

    return [
      {
        type: "group",
        heading: t("settings.languageSection"),
        items: [{
          name: t("settings.language"),
          desc: t("settings.languageDesc"),
          control: dropdown("language", {
            auto: t("language.auto"),
            ru: t("language.ru"),
            en: t("language.en")
          })
        }]
      },
      {
        type: "group",
        heading: t("settings.templates"),
        items: [
          {
            name: t("settings.templateFolder"),
            desc: t("settings.templateFolderDesc"),
            control: text("templateFolder", "Templates")
          },
          {
            name: t("settings.defaultTemplate"),
            desc: t("settings.defaultTemplateDesc"),
            control: dropdown("preset", templateOptions)
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.protocols"),
        items: [
          {
            name: t("settings.protocolFolder"),
            desc: t("settings.protocolFolderDesc"),
            control: text("rootFolder", t("settings.vaultRootPlaceholder"))
          },
          {
            name: t("settings.protocolStructure"),
            desc: t("settings.protocolStructureDesc"),
            control: dropdown("pathFormat", {
              "year-month": t("path.yearMonth"),
              year: t("path.year"),
              flat: t("path.flat")
            })
          },
          {
            name: t("settings.openProtocol"),
            desc: t("settings.openProtocolDesc"),
            control: toggle("openMeetingAfterCreate")
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.quickMeetings"),
        items: [
          {
            name: t("settings.logFolder"),
            desc: t("settings.logFolderDesc"),
            control: text("meetingLogFolder", t("settings.vaultRootPlaceholder"))
          },
          {
            name: t("settings.logStructure"),
            desc: t("settings.logStructureDesc"),
            control: dropdown("meetingLogStructure", {
              "year-month": t("path.yearMonth"),
              year: t("path.year"),
              flat: t("path.flat")
            })
          },
          {
            name: t("settings.flatFilename"),
            desc: t("settings.flatFilenameDesc"),
            control: text("meetingLogFlatFilename", "Meetings")
          },
          {
            name: t("settings.dateFormat"),
            desc: t("settings.dateFormatDesc"),
            control: dropdown("meetingLogDateFormat", {
              "DD.MM.YYYY": t("settings.dateRu"),
              "YYYY-MM-DD": t("settings.dateIso")
            })
          },
          {
            name: t("settings.openLog"),
            desc: t("settings.openLogDesc"),
            control: toggle("openQuickMeetingAfterSave")
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.dashboard"),
        items: [
          {
            name: t("settings.taskFolder"),
            desc: t("settings.taskFolderDesc"),
            control: text("taskFolder", "!Work/Meeting notes")
          },
          {
            name: t("settings.taskInboxFile"),
            desc: t("settings.taskInboxFileDesc"),
            control: text("taskInboxFile", t("settings.taskInboxFilePlaceholder"))
          },
          {
            name: t("settings.defaultFilter"),
            desc: t("settings.defaultFilterDesc"),
            control: dropdown("dashboardDefaultStatus", {
              all: t("dashboard.all"),
              open: t("dashboard.openPlural"),
              overdue: t("dashboard.overduePlural"),
              done: t("dashboard.donePlural"),
              cancelled: t("dashboard.cancelledPlural")
            })
          },
          {
            name: t("settings.autoRefresh"),
            desc: t("settings.autoRefreshDesc"),
            control: toggle("dashboardAutoRefresh")
          }
        ]
      },
      {
        type: "group",
        heading: t("settings.maintenance"),
        items: [{
          name: t("settings.reset"),
          desc: t("settings.resetDesc"),
          action: async () => {
            await this.plugin.resetSettings();
            this.update();
          }
        }]
      }
    ];
  }

  // Compatibility fallback for Obsidian 1.8–1.12. Obsidian 1.13+ uses
  // getSettingDefinitions() and does not call this deprecated API.
  display() {
    const { containerEl } = this;
    const t = (key, variables) => this.plugin.t(key, variables);
    containerEl.replaceChildren();
    new Setting(containerEl).setName(t("settings.title")).setHeading();

    new Setting(containerEl).setName(t("settings.languageSection")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.language"))
      .setDesc(t("settings.languageDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("auto", t("language.auto"))
        .addOption("ru", t("language.ru"))
        .addOption("en", t("language.en"))
        .setValue(this.plugin.settings.language)
        .onChange(async (value) => {
          await this.plugin.updateSettings({ language: value });
          this.display();
        }));

    new Setting(containerEl).setName(t("settings.templates")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.templateFolder"))
      .setDesc(t("settings.templateFolderDesc"))
      .addText((text) => text
        .setPlaceholder("Templates")
        .setValue(this.plugin.settings.templateFolder)
        .onChange(async (value) => this.plugin.updateSettings({ templateFolder: value.trim() })));

    const templateFiles = this.app.vault.getMarkdownFiles()
      .filter((file) => file.parent?.path === this.plugin.settings.templateFolder)
      .sort((left, right) => left.name.localeCompare(right.name, this.plugin.language));
    new Setting(containerEl)
      .setName(t("settings.defaultTemplate"))
      .setDesc(t("settings.defaultTemplateDesc"))
      .addDropdown((dropdown) => {
        templateFiles.forEach((file) => dropdown.addOption(file.name, file.basename));
        dropdown.addOption(BUILTIN_TEMPLATE_FILENAME, t("builtin.name"));
        if (this.plugin.settings.preset && this.plugin.settings.preset !== BUILTIN_TEMPLATE_FILENAME
          && !templateFiles.some((file) => file.name === this.plugin.settings.preset)) {
          dropdown.addOption(this.plugin.settings.preset, t("settings.notFound", { name: this.plugin.settings.preset }));
        }
        return dropdown
          .setValue(this.plugin.settings.preset || BUILTIN_TEMPLATE_FILENAME)
          .onChange(async (value) => this.plugin.updateSettings({ preset: value }));
      });

    new Setting(containerEl).setName(t("settings.protocols")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.protocolFolder"))
      .setDesc(t("settings.protocolFolderDesc"))
      .addText((text) => text
        .setPlaceholder(t("settings.vaultRootPlaceholder"))
        .setValue(this.plugin.settings.rootFolder)
        .onChange(async (value) => this.plugin.updateSettings({ rootFolder: value.trim() })));

    new Setting(containerEl)
      .setName(t("settings.protocolStructure"))
      .setDesc(t("settings.protocolStructureDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("year-month", t("path.yearMonth"))
        .addOption("year", t("path.year"))
        .addOption("flat", t("path.flat"))
        .setValue(this.plugin.settings.pathFormat)
        .onChange(async (value) => this.plugin.updateSettings({ pathFormat: value })));

    new Setting(containerEl)
      .setName(t("settings.openProtocol"))
      .setDesc(t("settings.openProtocolDesc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openMeetingAfterCreate)
        .onChange(async (value) => this.plugin.updateSettings({ openMeetingAfterCreate: value })));

    new Setting(containerEl).setName(t("settings.quickMeetings")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.logFolder"))
      .setDesc(t("settings.logFolderDesc"))
      .addText((text) => text
        .setPlaceholder(t("settings.vaultRootPlaceholder"))
        .setValue(this.plugin.settings.meetingLogFolder)
        .onChange(async (value) => this.plugin.updateSettings({ meetingLogFolder: value.trim() })));

    new Setting(containerEl)
      .setName(t("settings.logStructure"))
      .setDesc(t("settings.logStructureDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("year-month", t("path.yearMonth"))
        .addOption("year", t("path.year"))
        .addOption("flat", t("path.flat"))
        .setValue(this.plugin.settings.meetingLogStructure)
        .onChange(async (value) => this.plugin.updateSettings({ meetingLogStructure: value })));

    new Setting(containerEl)
      .setName(t("settings.flatFilename"))
      .setDesc(t("settings.flatFilenameDesc"))
      .addText((text) => text
        .setPlaceholder("Meetings")
        .setValue(this.plugin.settings.meetingLogFlatFilename)
        .onChange(async (value) => this.plugin.updateSettings({ meetingLogFlatFilename: value.trim() })));

    new Setting(containerEl)
      .setName(t("settings.dateFormat"))
      .setDesc(t("settings.dateFormatDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("DD.MM.YYYY", t("settings.dateRu"))
        .addOption("YYYY-MM-DD", t("settings.dateIso"))
        .setValue(this.plugin.settings.meetingLogDateFormat)
        .onChange(async (value) => this.plugin.updateSettings({ meetingLogDateFormat: value })));

    new Setting(containerEl)
      .setName(t("settings.openLog"))
      .setDesc(t("settings.openLogDesc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.openQuickMeetingAfterSave)
        .onChange(async (value) => this.plugin.updateSettings({ openQuickMeetingAfterSave: value })));

    new Setting(containerEl).setName(t("settings.dashboard")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.taskFolder"))
      .setDesc(t("settings.taskFolderDesc"))
      .addText((text) => text
        .setPlaceholder("!Work/Meeting notes")
        .setValue(this.plugin.settings.taskFolder)
        .onChange(async (value) => this.plugin.updateSettings({ taskFolder: value.trim() })));

    new Setting(containerEl)
      .setName(t("settings.taskInboxFile"))
      .setDesc(t("settings.taskInboxFileDesc"))
      .addText((text) => text
        .setPlaceholder(t("settings.taskInboxFilePlaceholder"))
        .setValue(this.plugin.settings.taskInboxFile)
        .onChange(async (value) => this.plugin.updateSettings({ taskInboxFile: value.trim() })));

    new Setting(containerEl)
      .setName(t("settings.defaultFilter"))
      .setDesc(t("settings.defaultFilterDesc"))
      .addDropdown((dropdown) => dropdown
        .addOption("all", t("dashboard.all"))
        .addOption("open", t("dashboard.openPlural"))
        .addOption("overdue", t("dashboard.overduePlural"))
        .addOption("done", t("dashboard.donePlural"))
        .addOption("cancelled", t("dashboard.cancelledPlural"))
        .setValue(this.plugin.settings.dashboardDefaultStatus)
        .onChange(async (value) => this.plugin.updateSettings({ dashboardDefaultStatus: value })));

    new Setting(containerEl)
      .setName(t("settings.autoRefresh"))
      .setDesc(t("settings.autoRefreshDesc"))
      .addToggle((toggle) => toggle
        .setValue(this.plugin.settings.dashboardAutoRefresh)
        .onChange(async (value) => this.plugin.updateSettings({ dashboardAutoRefresh: value })));

    new Setting(containerEl).setName(t("settings.maintenance")).setHeading();
    new Setting(containerEl)
      .setName(t("settings.reset"))
      .setDesc(t("settings.resetDesc"))
      .addButton((button) => button
        .setButtonText(t("settings.resetButton"))
        .onClick(async () => {
          await this.plugin.resetSettings();
          this.display();
        }));
  }
}

module.exports = { MeetingToolsSettingTab };
