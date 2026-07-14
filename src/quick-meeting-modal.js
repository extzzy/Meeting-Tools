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
    this.contentEl.innerHTML = `
      <h2>${t("quick.title")}</h2>
      <form data-quick-form>
        <label class="mt-field"><span>${t("common.date")}</span><input type="date" data-quick-date required></label>
        <label class="mt-field"><span>${t("quick.summary")}</span><textarea data-quick-summary rows="5" placeholder="${t("quick.placeholder")}" required></textarea></label>
        <p class="mt-quick-hint">${t("quick.hint")}</p>
        <p class="mt-message" data-quick-message></p>
        <div class="mt-modal-actions">
          <button type="button" data-cancel>${t("common.cancel")}</button>
          <button type="submit" class="mod-cta" data-save>${t("quick.save")}</button>
        </div>
      </form>`;
    this.form = this.contentEl.querySelector("[data-quick-form]");
    this.date = this.contentEl.querySelector("[data-quick-date]");
    this.summary = this.contentEl.querySelector("[data-quick-summary]");
    this.message = this.contentEl.querySelector("[data-quick-message]");
    this.saveButton = this.contentEl.querySelector("[data-save]");
    this.date.value = localISODate();
    this.form.addEventListener("submit", (event) => this.save(event));
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.contentEl.querySelector("[data-cancel]").addEventListener("click", () => this.close());
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
