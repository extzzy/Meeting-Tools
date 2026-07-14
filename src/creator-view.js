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

    const createField = (parent, classes, label, detail = "") => {
      const field = parent.createEl("label", { cls: `mt-field${classes ? ` ${classes}` : ""}` });
      const caption = field.createEl("span");
      caption.setText(label);
      if (detail) caption.createEl("small").setText(` ${detail}`);
      return field;
    };

    this.root = this.contentEl.createDiv({ cls: "mt-shell" });
    const header = this.root.createEl("header", { cls: "mt-header" });
    const titleBlock = header.createDiv();
    titleBlock.createDiv({ cls: "mt-eyebrow" }).setText("Meeting tools");
    titleBlock.createEl("h1").setText(t("creator.title"));
    const headerActions = header.createDiv({ cls: "mt-header-actions" });
    this.quickMeetingButton = headerActions.createEl("button", { cls: "mt-secondary" });
    this.quickMeetingButton.type = "button";
    this.quickMeetingButton.setText(t("creator.quick"));
    this.dashboardButton = headerActions.createEl("button", { cls: "mt-secondary" });
    this.dashboardButton.type = "button";
    this.dashboardButton.setText(t("creator.tasks"));

    this.form = this.root.createEl("form", { cls: "mt-panel mt-creator" });
    const quickGrid = this.form.createDiv({ cls: "mt-quick-grid" });

    const typeField = createField(quickGrid, "mt-type", t("creator.meetingType"));
    this.preset = typeField.createEl("select");
    this.preset.disabled = true;
    this.preset.createEl("option").setText(t("creator.loadingTemplates"));

    const dateField = createField(quickGrid, "mt-date", t("common.date"));
    this.date = dateField.createEl("input");
    this.date.type = "date";
    this.date.required = true;

    const topicField = createField(quickGrid, "mt-topic", t("creator.topic"), t("common.optional"));
    this.suffix = topicField.createEl("input");
    this.suffix.type = "text";
    this.suffix.placeholder = t("creator.exampleApi");

    this.customField = createField(quickGrid, "mt-full mt-custom hidden", t("creator.meetingName"));
    this.customTitle = this.customField.createEl("input");
    this.customTitle.type = "text";
    this.customTitle.placeholder = t("creator.exampleCommittee");

    const participantsField = createField(quickGrid, "mt-full", t("creator.participants"), t("creator.commaSeparated"));
    this.participants = participantsField.createEl("input");
    this.participants.type = "text";
    this.participants.placeholder = t("creator.peopleExample");

    const templateSection = this.form.createEl("section", { cls: "mt-template-section" });
    const templateHeading = templateSection.createDiv({ cls: "mt-section-heading" });
    templateHeading.createEl("span").setText(t("creator.templateFields"));
    this.templateStatus = templateHeading.createEl("span");
    this.templateStatus.setText(t("common.loading"));
    this.templateFields = templateSection.createDiv({ cls: "mt-template-fields" });

    const resultRow = this.form.createDiv({ cls: "mt-result-row" });
    const pathBox = resultRow.createDiv({ cls: "mt-path-box" });
    pathBox.createEl("span").setText(t("creator.futureFile"));
    this.pathPreview = pathBox.createEl("code");
    this.pathPreview.setText("—");
    this.createButton = resultRow.createEl("button", { cls: "mod-cta mt-create" });
    this.createButton.type = "submit";
    this.createButton.disabled = true;
    this.createButton.setText(t("creator.create"));

    this.message = this.form.createEl("p", { cls: "mt-message" });
    const drawers = this.form.createDiv({ cls: "mt-drawers" });
    const pathDetails = drawers.createEl("details");
    pathDetails.createEl("summary").setText(t("creator.pathSettings"));
    const pathSettings = pathDetails.createDiv({ cls: "mt-settings" });
    const rootField = createField(pathSettings, "", t("creator.rootFolder"), t("common.optional"));
    this.rootFolder = rootField.createEl("input");
    this.rootFolder.type = "text";
    this.rootFolder.placeholder = t("creator.vaultRootPlaceholder");
    const structureField = createField(pathSettings, "", t("creator.structure"));
    this.pathFormat = structureField.createEl("select");
    [
      ["year-month", t("path.yearMonth")],
      ["year", t("path.year")],
      ["flat", t("path.flat")]
    ].forEach(([value, label]) => {
      const option = this.pathFormat.createEl("option");
      option.value = value;
      option.setText(label);
    });

    const previewDetails = drawers.createEl("details");
    previewDetails.createEl("summary").setText(t("creator.preview"));
    this.markdownPreview = previewDetails.createEl("pre");

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
    this.quickMeetingButton.addEventListener("click", () => this.plugin.openQuickMeeting());
    this.dashboardButton.addEventListener("click", () => this.plugin.activateView("meeting-tools-dashboard"));
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
