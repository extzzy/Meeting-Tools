const { Modal, Notice } = require("obsidian");
const { localISODate } = require("./services");

class QuickMeetingModal extends Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
  }

  onOpen() {
    const t = (key, variables) => this.plugin.t(key, variables);
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("mt-quick-modal");

    this.contentEl.createEl("h2").setText(t("quick.title"));
    this.form = this.contentEl.createEl("form");

    const dateField = this.form.createEl("label", { cls: "mt-field" });
    dateField.createEl("span").setText(t("common.date"));
    this.date = dateField.createEl("input");
    this.date.type = "date";
    this.date.required = true;

    const summaryField = this.form.createEl("label", { cls: "mt-field" });
    summaryField.createEl("span").setText(t("quick.summary"));
    this.summary = summaryField.createEl("textarea");
    this.summary.rows = 5;
    this.summary.placeholder = t("quick.placeholder");
    this.summary.required = true;

    this.form.createEl("p", { cls: "mt-quick-hint" }).setText(t("quick.hint"));
    this.message = this.form.createEl("p", { cls: "mt-message" });
    const actions = this.form.createDiv({ cls: "mt-modal-actions" });
    const cancelButton = actions.createEl("button");
    cancelButton.type = "button";
    cancelButton.setText(t("common.cancel"));
    this.saveButton = actions.createEl("button", { cls: "mod-cta" });
    this.saveButton.type = "submit";
    this.saveButton.setText(t("quick.save"));

    this.date.value = localISODate();
    this.form.addEventListener("submit", (event) => this.save(event));
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    cancelButton.addEventListener("click", () => this.close());
    window.setTimeout(() => this.summary.focus(), 0);
  }

  async save(event) {
    event.preventDefault();
    this.saveButton.disabled = true;
    this.message.textContent = this.plugin.t("quick.saving");
    this.message.classList.remove("is-error");
    try {
      const result = await this.plugin.meetings.appendQuickMeeting({
        date: this.date.value,
        summary: this.summary.value,
        folder: this.plugin.settings.meetingLogFolder,
        structure: this.plugin.settings.meetingLogStructure,
        dateFormat: this.plugin.settings.meetingLogDateFormat,
        flatFilename: this.plugin.settings.meetingLogFlatFilename
      });
      if (this.plugin.settings.openQuickMeetingAfterSave) {
        await this.plugin.app.workspace.getLeaf("tab").openFile(result.file);
      }
      new Notice(this.plugin.t("quick.saved", { path: result.path }));
      this.close();
    } catch (error) {
      this.message.textContent = error.message;
      this.message.classList.add("is-error");
      this.saveButton.disabled = false;
    }
  }

  onClose() {
    this.contentEl.replaceChildren();
  }
}

module.exports = { QuickMeetingModal };
