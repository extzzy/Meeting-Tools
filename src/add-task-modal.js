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

    this.contentEl.createEl("h2").setText(t("task.addTitle"));
    this.form = this.contentEl.createEl("form");

    const titleField = this.form.createEl("label", { cls: "mt-field" });
    titleField.createEl("span").setText(t("task.titleLabel"));
    this.title = titleField.createEl("input");
    this.title.type = "text";
    this.title.placeholder = t("task.titlePlaceholder");
    this.title.required = true;

    const assigneeField = this.form.createEl("label", { cls: "mt-field" });
    const assigneeLabel = assigneeField.createEl("span");
    assigneeLabel.setText(t("task.assigneePlaceholder"));
    assigneeLabel.createEl("small").setText(` ${t("common.optional")}`);
    this.assignee = assigneeField.createEl("input");
    this.assignee.type = "text";
    this.assignee.placeholder = t("task.assigneePlaceholder");

    const dueField = this.form.createEl("label", { cls: "mt-field" });
    const dueLabel = dueField.createEl("span");
    dueLabel.setText(t("task.dueLabel"));
    dueLabel.createEl("small").setText(` ${t("common.optional")}`);
    this.due = dueField.createEl("input");
    this.due.type = "date";

    const target = this.form.createEl("p", { cls: "mt-task-target" });
    target.setText(`${t("task.targetFile")}: `);
    target.createEl("code").setText(this.plugin.settings.taskInboxFile);
    this.message = this.form.createEl("p", { cls: "mt-message" });

    const actions = this.form.createDiv({ cls: "mt-modal-actions" });
    const cancelButton = actions.createEl("button");
    cancelButton.type = "button";
    cancelButton.setText(t("common.cancel"));
    this.saveButton = actions.createEl("button", { cls: "mod-cta" });
    this.saveButton.type = "submit";
    this.saveButton.setText(t("task.addButton"));

    this.form.addEventListener("submit", (event) => this.save(event));
    this.form.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        this.form.requestSubmit();
      }
    });
    cancelButton.addEventListener("click", () => this.close());
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
