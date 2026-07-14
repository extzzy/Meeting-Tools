const { Notice, Plugin } = require("obsidian");
const { resolveLanguage, translate } = require("./i18n");
const { MeetingService, TaskService, MEETING_ROOT } = require("./services");
const { MeetingCreatorView, VIEW_TYPE_CREATOR } = require("./creator-view");
const { TaskDashboardView, VIEW_TYPE_DASHBOARD } = require("./dashboard-view");
const { QuickMeetingModal } = require("./quick-meeting-modal");
const { MeetingToolsSettingTab } = require("./settings-tab");

const DEFAULT_SETTINGS = {
  language: "auto",
  templateFolder: "Шаблоны",
  rootFolder: MEETING_ROOT,
  pathFormat: "year-month",
  preset: "Daily DBA + DevOps.md",
  openMeetingAfterCreate: true,
  meetingLogFolder: "Встречи",
  meetingLogStructure: "year",
  meetingLogDateFormat: "DD.MM.YYYY",
  meetingLogFlatFilename: "Встречи",
  openQuickMeetingAfterSave: false,
  taskFolder: MEETING_ROOT,
  taskInboxFile: `${MEETING_ROOT}/Задачи.md`,
  dashboardDefaultStatus: "all",
  dashboardAutoRefresh: true
};

module.exports = class MeetingToolsPlugin extends Plugin {
  async onload() {
    this.settings = { ...DEFAULT_SETTINGS, ...(await this.loadData()) };
    this.language = resolveLanguage(this.settings.language);
    this.meetings = new MeetingService(this.app, (key, variables) => this.t(key, variables));
    this.tasks = new TaskService(this.app, this.settings.taskFolder, (key, variables) => this.t(key, variables));
    this.addSettingTab(new MeetingToolsSettingTab(this.app, this));

    this.registerView(VIEW_TYPE_CREATOR, (leaf) => new MeetingCreatorView(leaf, this));
    this.registerView(VIEW_TYPE_DASHBOARD, (leaf) => new TaskDashboardView(leaf, this));

    this.addRibbonIcon("calendar-plus", this.t("plugin.createRibbon"), () => this.activateView(VIEW_TYPE_CREATOR));
    this.addRibbonIcon("notebook-pen", this.t("plugin.quickRibbon"), () => this.openQuickMeeting());
    this.addRibbonIcon("list-todo", this.t("plugin.dashboardRibbon"), () => this.activateView(VIEW_TYPE_DASHBOARD));

    this.addCommand({
      id: "open-meeting-creator",
      name: this.t("plugin.createRibbon"),
      callback: () => this.activateView(VIEW_TYPE_CREATOR)
    });
    this.addCommand({
      id: "add-quick-meeting",
      name: this.t("plugin.quickCommand"),
      callback: () => this.openQuickMeeting()
    });
    this.addCommand({
      id: "open-task-dashboard",
      name: this.t("plugin.openDashboardCommand"),
      callback: () => this.activateView(VIEW_TYPE_DASHBOARD)
    });
  }

  openQuickMeeting() {
    new QuickMeetingModal(this.app, this).open();
  }

  t(key, variables) { return translate(this.language, key, variables); }
  locale() { return this.language === "ru" ? "ru-RU" : "en-US"; }

  async activateView(type) {
    try {
      const existing = this.app.workspace.getLeavesOfType(type)[0];
      const leaf = existing ?? this.app.workspace.getLeaf("tab");
      if (!existing) await leaf.setViewState({ type, active: true });
      this.app.workspace.revealLeaf(leaf);
    } catch (error) {
      console.error("Meeting Tools: failed to open view", error);
      new Notice(this.t("plugin.openFailed", { error: error.message }));
    }
  }

  async updateSettings(changes) {
    this.settings = { ...this.settings, ...changes };
    if (Object.prototype.hasOwnProperty.call(changes, "language")) {
      this.language = resolveLanguage(this.settings.language);
      this.meetings = new MeetingService(this.app, (key, variables) => this.t(key, variables));
    }
    if (Object.prototype.hasOwnProperty.call(changes, "taskFolder") || Object.prototype.hasOwnProperty.call(changes, "language")) {
      this.tasks = new TaskService(this.app, this.settings.taskFolder, (key, variables) => this.t(key, variables));
    }
    await this.saveData(this.settings);
  }

  async resetSettings() {
    this.settings = { ...DEFAULT_SETTINGS };
    this.language = resolveLanguage(this.settings.language);
    this.meetings = new MeetingService(this.app, (key, variables) => this.t(key, variables));
    this.tasks = new TaskService(this.app, this.settings.taskFolder, (key, variables) => this.t(key, variables));
    await this.saveData(this.settings);
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_CREATOR);
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_DASHBOARD);
  }
};
