const { ItemView, Notice } = require("obsidian");
const { AddTaskModal } = require("./add-task-modal");

const VIEW_TYPE_DASHBOARD = "meeting-tools-dashboard";

function formatDate(value, locale) {
  if (!value) return "—";
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat(locale).format(date);
}

function statusInfo(task, t) {
  if (task.overdue) return { label: t("status.overdue"), className: "is-overdue" };
  if (task.status === "done") return { label: t("status.done"), className: "is-done" };
  if (task.status === "cancelled") return { label: t("status.cancelled"), className: "is-cancelled" };
  if (task.status === "open") return { label: t("status.open"), className: "is-open" };
  return { label: t("status.other"), className: "" };
}

class TaskDashboardView extends ItemView {
  constructor(leaf, plugin) {
    super(leaf);
    this.plugin = plugin;
    this.tasks = [];
    this.refreshTimer = null;
  }

  getViewType() { return VIEW_TYPE_DASHBOARD; }
  getDisplayText() { return this.plugin.t("dashboard.title"); }
  getIcon() { return "list-todo"; }

  async onOpen() {
    const t = (key, variables) => this.plugin.t(key, variables);
    this.contentEl.replaceChildren();
    this.contentEl.classList.add("meeting-tools-view");
    this.contentEl.innerHTML = `
      <div class="mt-shell">
        <header class="mt-header">
          <div><div class="mt-eyebrow">${t("dashboard.eyebrow")}</div><h1>${t("dashboard.title")}</h1></div>
          <div class="mt-header-actions"><button class="mod-cta" type="button" data-add-task>${t("dashboard.addTask")}</button><button class="mt-secondary" type="button" data-refresh>${t("common.refresh")}</button></div>
        </header>
        <section class="mt-panel mt-dashboard">
          <div class="mt-stats" aria-label="${t("dashboard.stats")}">
            <div><span>${t("dashboard.total")}</span><strong data-count-all>—</strong></div>
            <div><span>${t("dashboard.open")}</span><strong data-count-open>—</strong></div>
            <div class="is-overdue"><span>${t("dashboard.overdue")}</span><strong data-count-overdue>—</strong></div>
            <div class="is-done"><span>${t("dashboard.done")}</span><strong data-count-done>—</strong></div>
          </div>
          <div class="mt-filters">
            <label class="mt-field mt-search"><span>${t("dashboard.search")}</span><input type="search" data-search placeholder="${t("dashboard.searchPlaceholder")}"></label>
            <label class="mt-field"><span>${t("dashboard.status")}</span><select data-status-filter><option value="all">${t("dashboard.all")}</option><option value="open">${t("dashboard.openPlural")}</option><option value="overdue">${t("dashboard.overduePlural")}</option><option value="done">${t("dashboard.donePlural")}</option><option value="cancelled">${t("dashboard.cancelledPlural")}</option></select></label>
            <label class="mt-field"><span>${t("dashboard.assignee")}</span><select data-assignee-filter><option value="all">${t("dashboard.allAssignees")}</option></select></label>
          </div>
          <div class="mt-table-wrap">
            <table class="mt-task-table"><thead><tr><th>${t("dashboard.task")}</th><th>${t("dashboard.assignee")}</th><th>${t("dashboard.due")}</th><th>${t("dashboard.file")}</th><th>${t("dashboard.status")}</th></tr></thead><tbody data-task-body></tbody></table>
            <p class="mt-empty hidden" data-empty>${t("dashboard.empty")}</p>
          </div>
          <p class="mt-message" data-message></p>
        </section>
      </div>`;

    this.root = this.contentEl.querySelector(".mt-shell");
    this.refreshButton = this.root.querySelector("[data-refresh]");
    this.search = this.root.querySelector("[data-search]");
    this.statusFilter = this.root.querySelector("[data-status-filter]");
    this.assigneeFilter = this.root.querySelector("[data-assignee-filter]");
    this.body = this.root.querySelector("[data-task-body]");
    this.empty = this.root.querySelector("[data-empty]");
    this.message = this.root.querySelector("[data-message]");
    if (["all", "open", "overdue", "done", "cancelled"].includes(this.plugin.settings.dashboardDefaultStatus)) {
      this.statusFilter.value = this.plugin.settings.dashboardDefaultStatus;
    }
    this.bindEvents();
    this.registerEvent(this.app.vault.on("modify", (file) => {
      if (!this.plugin.settings.dashboardAutoRefresh || !this.plugin.tasks.includesPath(file.path)) return;
      window.clearTimeout(this.refreshTimer);
      this.refreshTimer = window.setTimeout(() => this.loadTasks(false), 250);
    }));
    await this.loadTasks(true);
  }

  async onClose() { window.clearTimeout(this.refreshTimer); }

  bindEvents() {
    this.root.querySelector("[data-add-task]").addEventListener("click", () => {
      new AddTaskModal(this.app, this.plugin, () => this.loadTasks(false)).open();
    });
    this.refreshButton.addEventListener("click", () => this.loadTasks(true));
    this.search.addEventListener("input", () => this.render());
    this.statusFilter.addEventListener("change", () => this.render());
    this.assigneeFilter.addEventListener("change", () => this.render());
    this.body.addEventListener("change", (event) => this.changeStatus(event));
    this.body.addEventListener("click", (event) => this.openTaskSource(event));
  }

  async loadTasks(showProgress = false) {
    if (showProgress) this.showMessage(this.plugin.t("dashboard.scanning"));
    this.refreshButton.disabled = true;
    try {
      this.tasks = await this.plugin.tasks.collectTasks();
      this.updateAssignees();
      this.render();
      const time = new Intl.DateTimeFormat(this.plugin.locale(), { hour: "2-digit", minute: "2-digit" }).format(new Date());
      this.showMessage(this.plugin.t("dashboard.updated", { time }));
    } catch (error) {
      this.showMessage(this.plugin.t("dashboard.loadFailed", { error: error.message }), true);
    } finally {
      this.refreshButton.disabled = false;
    }
  }

  updateAssignees() {
    const selected = this.assigneeFilter.value;
    const assignees = [...new Set(this.tasks.map((task) => task.assignee).filter(Boolean))].sort((left, right) => left.localeCompare(right, this.plugin.language));
    this.assigneeFilter.replaceChildren(new Option(this.plugin.t("dashboard.allAssignees"), "all"));
    assignees.forEach((assignee) => this.assigneeFilter.append(new Option(assignee, assignee)));
    this.assigneeFilter.value = assignees.includes(selected) ? selected : "all";
  }

  filteredTasks() {
    const query = this.search.value.trim().toLocaleLowerCase(this.plugin.locale());
    const status = this.statusFilter.value;
    const assignee = this.assigneeFilter.value;
    const order = { open: 0, other: 1, cancelled: 2, done: 3 };
    return this.tasks.filter((task) => {
      const searchable = `${task.title} ${task.assignee} ${task.source}`.toLocaleLowerCase(this.plugin.locale());
      return (!query || searchable.includes(query))
        && (assignee === "all" || task.assignee === assignee)
        && (status === "all" || (status === "overdue" ? task.overdue : task.status === status));
    }).sort((left, right) => {
      if (left.overdue !== right.overdue) return left.overdue ? -1 : 1;
      const statusDifference = (order[left.status] ?? 1) - (order[right.status] ?? 1);
      if (statusDifference) return statusDifference;
      if (left.due !== right.due) return (left.due || "9999-99-99").localeCompare(right.due || "9999-99-99");
      return `${left.source} ${left.title}`.localeCompare(`${right.source} ${right.title}`, this.plugin.language);
    });
  }

  render() {
    const open = this.tasks.filter((task) => task.status === "open").length;
    this.root.querySelector("[data-count-all]").textContent = this.tasks.length.toLocaleString(this.plugin.locale());
    this.root.querySelector("[data-count-open]").textContent = open.toLocaleString(this.plugin.locale());
    this.root.querySelector("[data-count-overdue]").textContent = this.tasks.filter((task) => task.overdue).length.toLocaleString(this.plugin.locale());
    this.root.querySelector("[data-count-done]").textContent = this.tasks.filter((task) => task.status === "done").length.toLocaleString(this.plugin.locale());
    const tasks = this.filteredTasks();
    this.body.replaceChildren();
    tasks.forEach((task) => this.body.append(this.taskRow(task)));
    this.empty.classList.toggle("hidden", tasks.length > 0);
  }

  taskRow(task) {
    const row = document.createElement("tr");
    if (task.status === "done") row.classList.add("is-task-done");
    const title = document.createElement("td");
    title.className = "mt-task-title";
    title.textContent = task.title;
    const assignee = document.createElement("td");
    assignee.textContent = task.assignee || "—";
    const due = document.createElement("td");
    due.textContent = formatDate(task.due, this.plugin.locale());
    const source = document.createElement("td");
    const open = document.createElement("button");
    open.type = "button";
    open.className = "mt-source-link";
    open.dataset.openTask = task.id;
    open.textContent = task.source;
    open.title = `${task.path}:${task.line}`;
    source.append(open);
    const statusCell = document.createElement("td");
    const info = statusInfo(task, (key) => this.plugin.t(key));
    const select = document.createElement("select");
    select.className = `mt-status-control ${info.className}`;
    select.dataset.statusTask = task.id;
    select.dataset.previousStatus = task.status;
    select.setAttribute("aria-label", this.plugin.t("dashboard.taskStatus", { title: task.title }));
    const options = [
      { value: "open", label: task.overdue ? this.plugin.t("status.overdue") : this.plugin.t("status.open") },
      { value: "done", label: this.plugin.t("status.done") },
      { value: "cancelled", label: this.plugin.t("status.cancelled") }
    ];
    if (!options.some((option) => option.value === task.status)) options.push({ value: task.status, label: info.label });
    options.forEach((option) => select.append(new Option(option.label, option.value)));
    select.value = task.status;
    statusCell.append(select);
    row.append(title, assignee, due, source, statusCell);
    return row;
  }

  async changeStatus(event) {
    const control = event.target.closest("[data-status-task]");
    if (!control) return;
    const task = this.tasks.find((item) => item.id === control.dataset.statusTask);
    if (!task || control.value === task.status) return;
    control.disabled = true;
    this.showMessage(this.plugin.t("dashboard.saving"));
    try {
      await this.plugin.tasks.updateStatus(task, control.value);
      await this.loadTasks(false);
      new Notice(control.value === "done" ? this.plugin.t("dashboard.completedNotice") : control.value === "cancelled" ? this.plugin.t("dashboard.cancelledNotice") : this.plugin.t("dashboard.reopenedNotice"));
    } catch (error) {
      control.value = control.dataset.previousStatus;
      control.disabled = false;
      this.showMessage(error.message, true);
      new Notice(error.message);
    }
  }

  async openTaskSource(event) {
    const button = event.target.closest("[data-open-task]");
    if (!button) return;
    const task = this.tasks.find((item) => item.id === button.dataset.openTask);
    if (!task) return;
    try { await this.plugin.tasks.openTask(task); }
    catch (error) { this.showMessage(error.message, true); }
  }

  showMessage(text, error = false) {
    this.message.textContent = text;
    this.message.classList.toggle("is-error", error);
  }
}

module.exports = { TaskDashboardView, VIEW_TYPE_DASHBOARD };
