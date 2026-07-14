const { ItemView, Notice } = require("obsidian");
const { localISODate, BUILTIN_TEMPLATE_FILENAME } = require("./services");

const VIEW_TYPE_CREATOR = "meeting-tools-creator";

function taskValues(editor) {
  return [...editor.querySelectorAll(".mt-task-row")].map((row) => ({
    title: row.querySelector("[data-task-title]")?.value.trim() ?? "",
    assignee: row.querySelector("[data-task-assignee]")?.value.trim() ?? "",
    due: row.querySelector("[data-task-due]")?.value ?? ""
  })).filter((task) => task.title || task.assignee || task.due);
}

function createTaskRow(value = {}, t = (key) => key) {
  const row = document.createElement("div");
  row.className = "mt-task-row";
  const title = document.createElement("input");
  title.type = "text";
  title.placeholder = t("task.titlePlaceholder");
  title.setAttribute("aria-label", t("task.titleLabel"));
  title.dataset.taskTitle = "";
  title.value = value.title ?? "";
  const assignee = document.createElement("input");
  assignee.type = "text";
  assignee.placeholder = t("task.assigneePlaceholder");
  assignee.setAttribute("aria-label", t("task.assigneeLabel"));
  assignee.dataset.taskAssignee = "";
  assignee.value = value.assignee ?? "";
  const due = document.createElement("input");
  due.type = "date";
  due.setAttribute("aria-label", t("task.dueLabel"));
  due.dataset.taskDue = "";
  due.value = value.due ?? "";
  const remove = document.createElement("button");
  remove.type = "button";
  remove.className = "mt-icon-button";
  remove.dataset.removeTask = "";
  remove.title = t("task.remove");
  remove.textContent = "×";
  row.append(title, assignee, due, remove);
  return row;
}

class MeetingCreatorView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.templates = [];
    this.activeTemplate = null;
    this.drafts = new Map();
  }

  getViewType() { return VIEW_TYPE_CREATOR; }
  getDisplayText() { return this.plugin.t("creator.title"); }
  getIcon() { return "calendar-plus"; }

  async onOpen() {
    const t = (key, variables) => this.plugin.t(key, variables);
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("meeting-tools-view");
    this.contentEl.innerHTML = `
      <div class="mt-shell">
        <header class="mt-header">
          <div><div class="mt-eyebrow">Meeting tools</div><h1>${t("creator.title")}</h1></div>
          <div class="mt-header-actions"><button class="mt-secondary" type="button" data-quick-meeting>${t("creator.quick")}</button><button class="mt-secondary" type="button" data-open-dashboard>${t("creator.tasks")}</button></div>
        </header>
        <form class="mt-panel mt-creator" data-form>
          <div class="mt-quick-grid">
            <label class="mt-field mt-type"><span>${t("creator.meetingType")}</span><select data-preset disabled><option>${t("creator.loadingTemplates")}</option></select></label>
            <label class="mt-field mt-date"><span>${t("common.date")}</span><input data-date type="date" required></label>
            <label class="mt-field mt-topic"><span>${t("creator.topic")} <small>${t("common.optional")}</small></span><input data-suffix type="text" placeholder="${t("creator.exampleApi")}"></label>
            <label class="mt-field mt-full mt-custom hidden"><span>${t("creator.meetingName")}</span><input data-custom-title type="text" placeholder="${t("creator.exampleCommittee")}"></label>
            <label class="mt-field mt-full"><span>${t("creator.participants")} <small>${t("creator.commaSeparated")}</small></span><input data-participants type="text" placeholder="${t("creator.peopleExample")}"></label>
          </div>
          <section class="mt-template-section">
            <div class="mt-section-heading"><span>${t("creator.templateFields")}</span><span data-template-status>${t("common.loading")}</span></div>
            <div class="mt-template-fields" data-template-fields></div>
          </section>
          <div class="mt-result-row">
            <div class="mt-path-box"><span>${t("creator.futureFile")}</span><code data-path>—</code></div>
            <button class="mod-cta mt-create" type="submit" disabled data-create>${t("creator.create")}</button>
          </div>
          <p class="mt-message" data-message></p>
          <div class="mt-drawers">
            <details><summary>${t("creator.pathSettings")}</summary><div class="mt-settings">
              <label class="mt-field"><span>${t("creator.rootFolder")} <small>${t("common.optional")}</small></span><input data-root type="text" placeholder="${t("creator.vaultRootPlaceholder")}"></label>
              <label class="mt-field"><span>${t("creator.structure")}</span><select data-path-format><option value="year-month">${t("path.yearMonth")}</option><option value="year">${t("path.year")}</option><option value="flat">${t("path.flat")}</option></select></label>
            </div></details>
            <details><summary>${t("creator.preview")}</summary><pre data-preview></pre></details>
          </div>
        </form>
      </div>`;

    this.root = this.contentEl.querySelector(".mt-shell");
    this.form = this.root.querySelector("[data-form]");
    this.preset = this.root.querySelector("[data-preset]");
    this.date = this.root.querySelector("[data-date]");
    this.suffix = this.root.querySelector("[data-suffix]");
    this.customTitle = this.root.querySelector("[data-custom-title]");
    this.customField = this.root.querySelector(".mt-custom");
    this.participants = this.root.querySelector("[data-participants]");
    this.templateFields = this.root.querySelector("[data-template-fields]");
    this.templateStatus = this.root.querySelector("[data-template-status]");
    this.rootFolder = this.root.querySelector("[data-root]");
    this.pathFormat = this.root.querySelector("[data-path-format]");
    this.pathPreview = this.root.querySelector("[data-path]");
    this.markdownPreview = this.root.querySelector("[data-preview]");
    this.message = this.root.querySelector("[data-message]");
    this.createButton = this.root.querySelector("[data-create]");

    this.date.value = localISODate();
    this.rootFolder.value = this.plugin.settings.rootFolder;
    this.pathFormat.value = this.plugin.settings.pathFormat;
    this.bindEvents();
    await this.loadTemplates();
  }

  bindEvents() {
    this.form.addEventListener("input", () => this.updatePreview());
    this.form.addEventListener("change", async (event) => {
      if (event.target === this.preset) {
        this.captureDraft();
        this.activeTemplate = this.templates.find((template) => template.filename === this.preset.value);
        this.customField.classList.toggle("hidden", !this.activeTemplate?.generic);
        this.renderTemplateFields();
      }
      await this.savePreferences();
      this.updatePreview();
    });
    this.templateFields.addEventListener("click", (event) => {
      const add = event.target.closest("[data-add-task]");
      if (add) {
        add.closest(".mt-task-editor").querySelector(".mt-task-rows").append(createTaskRow({}, (key) => this.plugin.t(key)));
        this.updatePreview();
        return;
      }
      const remove = event.target.closest("[data-remove-task]");
      if (remove) {
        const editor = remove.closest(".mt-task-editor");
        remove.closest(".mt-task-row").remove();
        if (!editor.querySelector(".mt-task-row")) editor.querySelector(".mt-task-rows").append(createTaskRow({}, (key) => this.plugin.t(key)));
        this.updatePreview();
      }
    });
    this.form.addEventListener("submit", (event) => this.submit(event));
    this.root.querySelector("[data-quick-meeting]").addEventListener("click", () => this.plugin.openQuickMeeting());
    this.root.querySelector("[data-open-dashboard]").addEventListener("click", () => this.plugin.activateView("meeting-tools-dashboard"));
  }

  async loadTemplates() {
    try {
      this.templates = await this.plugin.meetings.loadTemplates(this.plugin.settings.templateFolder);
      this.preset.replaceChildren();
      this.templates.forEach((template) => this.preset.append(new Option(template.name, template.filename)));
      const preferred = this.templates.some((template) => template.filename === this.plugin.settings.preset)
        ? this.plugin.settings.preset : this.templates[0].filename;
      this.preset.value = preferred;
      this.activeTemplate = this.templates.find((template) => template.filename === preferred);
      this.preset.disabled = false;
      this.createButton.disabled = false;
      this.customField.classList.toggle("hidden", !this.activeTemplate.generic);
      this.renderTemplateFields();
      this.updatePreview();
    } catch (error) {
      this.templateStatus.textContent = this.plugin.t("creator.loadError");
      this.showMessage(error.message, true);
    }
  }

  captureDraft() {
    if (!this.activeTemplate) return;
    this.drafts.set(this.activeTemplate.filename, this.fieldValues());
  }

  fieldValues() {
    const values = {};
    this.templateFields.querySelectorAll("[data-template-field]").forEach((control) => {
      values[control.dataset.templateField] = control.classList.contains("mt-task-editor") ? taskValues(control) : control.value.trim();
    });
    return values;
  }

  renderTemplateFields() {
    this.templateFields.replaceChildren();
    if (!this.activeTemplate) return;
    const editable = this.activeTemplate.tokens.filter((token) => token.editable);
    const draft = this.drafts.get(this.activeTemplate.filename) ?? {};
    this.templateStatus.textContent = this.activeTemplate.filename === BUILTIN_TEMPLATE_FILENAME
      ? this.plugin.t("creator.builtinStatus", { count: editable.length })
      : this.plugin.t("creator.fileStatus", { count: editable.length, file: this.activeTemplate.filename });
    editable.forEach((token) => {
      const field = document.createElement(token.control === "tasks" ? "div" : "label");
      field.className = `mt-template-field${token.control === "tasks" ? " mt-task-field" : ""}`;
      const title = document.createElement("span");
      title.textContent = token.displayTitle;
      if (token.control === "tasks") {
        const editor = document.createElement("div");
        editor.className = "mt-task-editor";
        editor.dataset.templateField = token.key;
        const rows = document.createElement("div");
        rows.className = "mt-task-rows";
        const tasks = Array.isArray(draft[token.key]) && draft[token.key].length ? draft[token.key] : [{}];
        tasks.forEach((task) => rows.append(createTaskRow(task, (key) => this.plugin.t(key))));
        const add = document.createElement("button");
        add.type = "button";
        add.className = "mt-link-button";
        add.dataset.addTask = "";
        add.textContent = this.plugin.t("creator.addTask");
        editor.append(rows, add);
        field.append(title, editor);
      } else {
        const input = document.createElement("textarea");
        input.rows = 1;
        input.placeholder = token.placeholder;
        input.value = draft[token.key] ?? "";
        input.dataset.templateField = token.key;
        field.append(title, input);
      }
      this.templateFields.append(field);
    });
  }

  meetingInput() {
    return {
      template: this.activeTemplate,
      date: this.date.value,
      suffix: this.suffix.value,
      customTitle: this.customTitle.value,
      participants: this.participants.value,
      fields: this.fieldValues(),
      rootFolder: this.rootFolder.value,
      pathFormat: this.pathFormat.value,
      openAfterCreate: this.plugin.settings.openMeetingAfterCreate
    };
  }

  updatePreview() {
    if (!this.activeTemplate) return;
    try {
      const prepared = this.plugin.meetings.prepareMeeting(this.meetingInput());
      this.pathPreview.textContent = prepared.path;
      this.markdownPreview.textContent = prepared.markdown;
      this.showMessage("");
    } catch (error) {
      this.pathPreview.textContent = "—";
      this.markdownPreview.textContent = "";
      this.showMessage(error.message, true);
    }
  }

  async submit(event) {
    event.preventDefault();
    try {
      this.captureDraft();
      await this.savePreferences();
      this.createButton.disabled = true;
      this.showMessage(this.plugin.t("creator.creating"));
      const result = await this.plugin.meetings.createMeeting(this.meetingInput());
      this.showMessage(this.plugin.t("creator.created", { path: result.path }));
      new Notice(this.plugin.t("creator.createdNotice", { name: result.file.basename }));
    } catch (error) {
      this.showMessage(error.message, true);
      new Notice(this.plugin.t("creator.createFailed", { error: error.message }));
    } finally {
      this.createButton.disabled = false;
    }
  }

  async savePreferences() {
    await this.plugin.updateSettings({
      rootFolder: this.rootFolder.value,
      pathFormat: this.pathFormat.value,
      preset: this.preset.value
    });
  }

  showMessage(text, error = false) {
    this.message.textContent = text;
    this.message.classList.toggle("is-error", error);
  }
}

module.exports = { MeetingCreatorView, VIEW_TYPE_CREATOR };
