const { Modal, Notice } = require("obsidian");

class AddTaskModal extends Modal {
  constructor(app, plugin, onCreated) {
    super(app);
    this.plugin = plugin;
    this.onCreated = onCreated;
  }

  onOpen() {
    const t = (key, variables) => this.plugin.t(key, variables);
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("mt-quick-modal", "mt-task-modal");
    this.contentEl.innerHTML = `
      <h2>${t("task.addTitle")}</h2>
      <form data-task-form>
        <label class="mt-field"><span>${t("task.titleLabel")}</span><input type="text" data-task-title placeholder="${t("task.titlePlaceholder")}" required></label>
        <label class="mt-field"><span>${t("task.assigneePlaceholder")} <small>${t("common.optional")}</small></span><input type="text" data-task-assignee placeholder="${t("task.assigneePlaceholder")}"></label>
        <label class="mt-field"><span>${t("task.dueLabel")} <small>${t("common.optional")}</small></span><input type="date" data-task-due></label>
        <p class="mt-task-target">${t("task.targetFile")}: <code></code></p>
        <p class="mt-message" data-task-message></p>
        <div class="mt-modal-actions">
          <button type="button" data-cancel>${t("common.cancel")}</button>
          <button type="submit" class="mod-cta" data-save>${t("task.addButton")}</button>
        </div>
      </form>`;
    this.form = this.contentEl.querySelector("[data-task-form]");
    this.title = this.contentEl.querySelector("[data-task-title]");
    this.assignee = this.contentEl.querySelector("[data-task-assignee]");
    this.due = this.contentEl.querySelector("[data-task-due]");
    this.message = this.contentEl.querySelector("[data-task-message]");
    this.saveButton = this.contentEl.querySelector("[data-save]");
    this.contentEl.querySelector(".mt-task-target code").textContent = this.plugin.settings.taskInboxFile;
    this.form.addEventListener("submit", (event) => this.save(event));
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    this.contentEl.querySelector("[data-cancel]").addEventListener("click", () => this.close());
    window.setTimeout(() => this.title.focus(), 0);
  }

  async save(event) {
    event.preventDefault();
    this.saveButton.disabled = true;
    this.message.textContent = this.plugin.t("task.saving");
    this.message.classList.remove("is-error");
    try {
      const result = await this.plugin.tasks.appendTask({
        title: this.title.value,
        assignee: this.assignee.value,
        due: this.due.value
      }, this.plugin.settings.taskInboxFile);
      await this.onCreated?.(result);
      new Notice(this.plugin.t("task.created", { path: result.path }));
      this.close();
    } catch (error) {
      this.message.textContent = error.message;
      this.message.classList.add("is-error");
      this.saveButton.disabled = false;
    }
  }

  onClose() { this.contentEl.replaceChildren(); }
}

module.exports = { AddTaskModal };
