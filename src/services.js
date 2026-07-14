const { createHash } = require("crypto");
const { normalizePath } = require("obsidian");

const TEMPLATE_FOLDER = "Шаблоны";
const MEETING_ROOT = "!Работа/Итоги встреч";
const MEETING_LOG_ROOT = "Встречи";
const BUILTIN_TEMPLATE_FILENAME = "__builtin_meeting__";
const TEMPLATE_ORDER = [
  "Daily DBA + DevOps.md",
  "Daily DevOps.md",
  "Еженедельная PaaS.md",
  "Еженедельная GPUaaS.md",
  "Техническая планерка (пн).md",
  "Техническая планерка (пт).md",
  "Встреча.md"
];

function localISODate() {
  const now = new Date();
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

function unquote(value) {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
    try { return JSON.parse(trimmed); } catch { return trimmed.slice(1, -1); }
  }
  if (trimmed.startsWith("'") && trimmed.endsWith("'")) return trimmed.slice(1, -1);
  return trimmed;
}

function frontmatterProperty(frontmatter, name) {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return unquote(frontmatter.match(new RegExp(`^${escaped}:\\s*(.*)$`, "m"))?.[1]);
}

function frontmatterTags(frontmatter) {
  const block = frontmatter.match(/^tags:\s*\n((?:[ \t]+-[^\n]*(?:\n|$))*)/m)?.[1] ?? "";
  return block.split("\n")
    .map((line) => line.match(/^\s*-\s*(.+)$/)?.[1])
    .filter(Boolean)
    .map(unquote);
}

function commentText(content) {
  return [...content.matchAll(/<!--([\s\S]*?)-->/g)]
    .map((match) => match[1].replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ");
}

function contentWithoutComments(content) {
  return content.replace(/<!--[\s\S]*?-->/g, "").trim();
}

function parseTemplate(file, source, t = (key) => key) {
  const normalized = source.replace(/\r\n?/g, "\n");
  const frontmatterMatch = normalized.match(/^---\n([\s\S]*?)\n---\n?/);
  const frontmatter = frontmatterMatch?.[1] ?? "";
  let body = normalized.slice(frontmatterMatch?.[0].length ?? 0)
    .replace(/<%\*[\s\S]*?-%>\s*/g, "")
    .replace(/^#\s+.*(?:\n|$)/m, "")
    .trim();

  const tokens = [];
  const summaryMatch = body.match(/^> \[!summary\]\s*(.+)$/m);
  if (summaryMatch) {
    const start = summaryMatch.index ?? 0;
    const contentStart = start + summaryMatch[0].length;
    const nextHeading = body.slice(contentStart).search(/^#{2,3}\s+/m);
    const end = nextHeading < 0 ? body.length : contentStart + nextHeading;
    const originalContent = body.slice(contentStart, end).trim();
    tokens.push({
      key: "summary",
      kind: "summary",
      level: 0,
      title: summaryMatch[1].trim(),
      displayTitle: summaryMatch[1].trim(),
      originalContent,
      placeholder: commentText(originalContent.replace(/^>\s?/gm, "")) || t("template.summaryPlaceholder"),
      control: "textarea",
      editable: true,
      position: start
    });
  }

  const headings = [...body.matchAll(/^(#{2,3})\s+(.+)$/gm)];
  let parentTitle = "";
  headings.forEach((match, index) => {
    const level = match[1].length;
    const title = match[2].trim();
    if (level === 2) parentTitle = title;
    const contentStart = (match.index ?? 0) + match[0].length;
    const end = headings[index + 1]?.index ?? body.length;
    const originalContent = body.slice(contentStart, end).trim();
    const placeholder = commentText(originalContent);
    const preservedContent = contentWithoutComments(originalContent);
    const normalizedTitle = title.toLocaleLowerCase();
    const isTasks = normalizedTitle === "задачи" || normalizedTitle === "tasks";
    tokens.push({
      key: `section-${index}`,
      kind: "section",
      level,
      title,
      displayTitle: level === 3 && parentTitle ? `${parentTitle} · ${title}` : title,
      originalContent,
      placeholder: placeholder || (preservedContent ? t("template.markdownPlaceholder") : t("template.addPlaceholder", { title: title.toLocaleLowerCase() })),
      control: isTasks ? "tasks" : "textarea",
      editable: Boolean(placeholder || preservedContent || isTasks),
      position: match.index ?? 0
    });
  });

  tokens.sort((left, right) => left.position - right.position);
  const name = file.basename;
  return {
    file,
    filename: file.name,
    name,
    generic: ["встреча", "meeting"].includes(name.toLocaleLowerCase()),
    metadata: {
      tags: frontmatterTags(frontmatter),
      project: frontmatterProperty(frontmatter, "project"),
      series: frontmatterProperty(frontmatter, "series"),
      cadence: frontmatterProperty(frontmatter, "cadence") || "ad-hoc",
      weekday: frontmatterProperty(frontmatter, "weekday")
    },
    tokens
  };
}

function builtinTemplate(t = (key) => key) {
  return {
    file: null,
    filename: BUILTIN_TEMPLATE_FILENAME,
    name: t("builtin.name"),
    generic: true,
    metadata: {
      tags: ["area/work", "type/meeting"],
      project: "",
      series: "",
      cadence: "ad-hoc",
      weekday: ""
    },
    tokens: [
      {
        key: "summary",
        kind: "summary",
        level: 0,
        title: t("builtin.summary"),
        displayTitle: t("builtin.summary"),
        originalContent: "",
        placeholder: t("builtin.summaryPlaceholder"),
        control: "textarea",
        editable: true,
        position: 0
      },
      {
        key: "builtin-decisions",
        kind: "section",
        level: 2,
        title: t("builtin.decisions"),
        displayTitle: t("builtin.decisions"),
        originalContent: "",
        placeholder: t("builtin.decisionsPlaceholder"),
        control: "textarea",
        editable: true,
        position: 1
      },
      {
        key: "builtin-tasks",
        kind: "section",
        level: 2,
        title: t("builtin.tasks"),
        displayTitle: t("builtin.tasks"),
        originalContent: "",
        placeholder: "",
        control: "tasks",
        editable: true,
        position: 2
      },
      {
        key: "builtin-notes",
        kind: "section",
        level: 2,
        title: t("builtin.notes"),
        displayTitle: t("builtin.notes"),
        originalContent: "",
        placeholder: t("builtin.notesPlaceholder"),
        control: "textarea",
        editable: true,
        position: 3
      }
    ]
  };
}

function yamlString(value) { return JSON.stringify(String(value ?? "")); }
function yamlList(values, indent = "  ") {
  if (!values.length) return " []";
  return `\n${values.map((value) => `${indent}- ${yamlString(value)}`).join("\n")}`;
}
function parseList(value) { return String(value).split(",").map((item) => item.trim()).filter(Boolean); }
function cleanFilename(value) {
  return String(value).replace(/[\\/:*?"<>|#[\]^]/g, "-").replace(/\s+/g, " ").replace(/\.{2,}/g, ".").trim();
}
function cleanFolder(value, t = (key) => key) {
  const parts = String(value ?? "").replace(/\\/g, "/").split("/").map((part) => part.trim()).filter(Boolean);
  if (parts.some((part) => part === "." || part === "..")) throw new Error(t("error.invalidPath"));
  return parts.join("/");
}
function renderTasks(tasks, assigneeTag = "исполнитель") {
  return (Array.isArray(tasks) ? tasks : []).filter((task) => task.title?.trim()).map((task) => {
    const assignee = String(task.assignee ?? "").replace(/^@+/, "").trim();
    const slug = assignee.toLocaleLowerCase("ru-RU").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "");
    const owner = assignee ? ` — @${assignee}${slug ? ` #${assigneeTag}/${slug}` : ""}` : "";
    const due = task.due ? ` 📅 ${task.due}` : "";
    return `- [ ] ${task.title.trim()}${owner}${due}`;
  }).join("\n");
}

class MeetingService {
  constructor(app, t = (key) => key) { this.app = app; this.t = t; }

  async loadTemplates(folder = TEMPLATE_FOLDER) {
    const templateFolder = cleanFolder(folder, this.t);
    if (!templateFolder) return [builtinTemplate(this.t)];
    const files = this.app.vault.getMarkdownFiles().filter((file) => file.parent?.path === templateFolder);
    files.sort((left, right) => {
      const leftOrder = TEMPLATE_ORDER.indexOf(left.name);
      const rightOrder = TEMPLATE_ORDER.indexOf(right.name);
      if (leftOrder >= 0 || rightOrder >= 0) return (leftOrder < 0 ? 999 : leftOrder) - (rightOrder < 0 ? 999 : rightOrder);
      return left.name.localeCompare(right.name, "ru");
    });
    if (!files.length) return [builtinTemplate(this.t)];
    const templates = await Promise.all(files.map(async (file) => parseTemplate(file, await this.app.vault.cachedRead(file), this.t)));
    return [...templates, builtinTemplate(this.t)];
  }

  prepareMeeting(input) {
    const { template, date, suffix, customTitle, participants, fields, rootFolder, pathFormat } = input;
    if (!date) throw new Error(this.t("error.dateRequired"));
    const meetingName = template.generic ? (String(customTitle).trim() || this.t("builtin.meeting")) : template.name;
    const suffixValue = cleanFilename(suffix);
    const title = cleanFilename(`${date} — ${meetingName}${suffixValue ? ` — ${suffixValue}` : ""}`);
    const root = cleanFolder(rootFolder, this.t);
    const [year, month] = date.split("-");
    const folders = root ? [root] : [];
    if (["year", "year-month"].includes(pathFormat)) folders.push(year);
    if (pathFormat === "year-month") folders.push(month);

    const body = template.tokens.map((token) => {
      const entered = fields[token.key];
      if (token.kind === "summary") {
        const content = entered
          ? String(entered).split("\n").map((line) => `> ${line}`).join("\n")
          : token.originalContent;
        return `> [!summary] ${token.title}${content ? `\n${content}` : ""}`;
      }
      const generated = token.control === "tasks" ? renderTasks(entered, this.t("task.assigneeTag")) : String(entered ?? "").trim();
      const content = token.editable && generated ? generated : token.originalContent;
      return `${"#".repeat(token.level)} ${token.title}${content ? `\n\n${content}` : ""}`;
    }).join("\n\n");

    const metadata = template.metadata;
    const project = template.generic ? meetingName : metadata.project;
    const series = template.generic ? meetingName : metadata.series;
    const weekday = metadata.weekday ? `\nweekday: ${yamlString(metadata.weekday)}` : "";
    const markdown = `---\ntags:${yamlList(metadata.tags)}\ndate: ${yamlString(date)}\nproject: ${yamlString(project)}\nseries: ${yamlString(series)}\ncadence: ${yamlString(metadata.cadence)}${weekday}\nparticipants:${yamlList(parseList(participants))}\nrelated: []\n---\n\n# ${title}\n\n${body}\n`;
    return { title, path: normalizePath([...folders, `${title}.md`].join("/")), markdown };
  }

  async createMeeting(input) {
    const prepared = this.prepareMeeting(input);
    const targetPath = this.uniquePath(prepared.path);
    const slash = targetPath.lastIndexOf("/");
    await this.ensureFolder(slash >= 0 ? targetPath.slice(0, slash) : "");
    const file = await this.app.vault.create(targetPath, prepared.markdown);
    if (input.openAfterCreate !== false) await this.app.workspace.getLeaf("tab").openFile(file);
    return { file, path: targetPath };
  }

  async appendQuickMeeting({
    date,
    summary,
    folder = MEETING_LOG_ROOT,
    structure = "year",
    dateFormat = "DD.MM.YYYY",
    flatFilename = "Встречи"
  }) {
    const normalizedDate = String(date ?? "").trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalizedDate)) throw new Error(this.t("error.invalidDate"));
    const lines = String(summary ?? "").split(/\r?\n/)
      .map((line) => line.trim().replace(/^[-*]\s+/, ""))
      .filter(Boolean);
    if (!lines.length) throw new Error(this.t("error.summaryRequired"));

    const [year, month, day] = normalizedDate.split("-");
    const displayDate = dateFormat === "YYYY-MM-DD" ? normalizedDate : `${day}.${month}.${year}`;
    const entry = lines.length === 1
      ? `${displayDate} — ${lines[0]}`
      : `${displayDate}\n${lines.map((line) => `- ${line}`).join("\n")}`;
    const logFolder = cleanFolder(folder, this.t);
    if (!["year-month", "year", "flat"].includes(structure)) throw new Error(this.t("error.logStructure"));
    const normalizedFlatFilename = cleanFilename(flatFilename).replace(/\.md$/i, "");
    if (structure === "flat" && !normalizedFlatFilename) throw new Error(this.t("error.flatFilename"));
    const logParts = logFolder ? [logFolder] : [];
    if (structure === "year-month") logParts.push(year, `${month}.md`);
    else if (structure === "flat") logParts.push(`${normalizedFlatFilename}.md`);
    else logParts.push(`${year}.md`);
    const path = normalizePath(logParts.join("/"));
    const heading = structure === "year-month" ? this.t("journal.headingMonth", { month, year }) : structure === "flat" ? normalizedFlatFilename : this.t("journal.headingYear", { year });
    const slash = path.lastIndexOf("/");
    await this.ensureFolder(slash >= 0 ? path.slice(0, slash) : "");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      const initial = `---\ntags:\n  - area/work\n  - type/meeting-log\n---\n\n# ${heading}\n\n${entry}\n`;
      file = await this.app.vault.create(path, initial);
    } else {
      await this.app.vault.process(file, (content) => `${content.trimEnd()}\n\n${entry}\n`);
    }
    return { file, path, entry };
  }

  uniquePath(path) {
    if (!this.app.vault.getAbstractFileByPath(path)) return path;
    const base = path.slice(0, -3);
    let suffix = 2;
    let candidate = `${base} (${suffix}).md`;
    while (this.app.vault.getAbstractFileByPath(candidate)) candidate = `${base} (${++suffix}).md`;
    return candidate;
  }

  async ensureFolder(path) {
    if (!path) return;
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
}

class TaskService {
  constructor(app, root = MEETING_ROOT, t = (key) => key) {
    this.app = app;
    this.t = t;
    let normalizedRoot = MEETING_ROOT;
    try { normalizedRoot = cleanFolder(root || MEETING_ROOT, this.t) || MEETING_ROOT; } catch { normalizedRoot = MEETING_ROOT; }
    this.root = `${normalizedRoot.replace(/\/$/, "")}/`;
  }
  includesPath(path) { return String(path).startsWith(this.root); }
  revision(line) { return createHash("sha256").update(line, "utf8").digest("hex"); }

  parseTask(file, line, index, today = localISODate()) {
    const match = line.match(/^\s*-\s+\[([^\]])\]\s+(.+)$/u);
    if (!match) return null;
    const marker = match[1];
    const rawText = match[2].trim();
    const due = rawText.match(/📅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? "";
    const doneDate = rawText.match(/✅\s*(\d{4}-\d{2}-\d{2})/u)?.[1] ?? "";
    const assigneeTag = rawText.match(/#(?:исполнитель|assignee)\/([^\s#]+)/iu)?.[1] ?? "";
    const visibleAssignee = rawText.match(/\s+—\s+@(.+?)(?=\s+#(?:исполнитель|assignee)\/|\s+📅|\s+✅|$)/iu)?.[1]?.trim() ?? "";
    const legacyAssigneeMatch = rawText.match(/(?:Отв\.?|Ответственный|Assignee|Owner):\s*(.+?)(?=\s*(?:📅|✅|⏳|🛫|➕|🔁|❌|$))/iu);
    const legacyAssignee = (legacyAssigneeMatch?.[1] ?? "").trim().replace(/[.,;:]+$/u, "");
    const assignee = visibleAssignee || legacyAssignee || assigneeTag.replace(/-/g, " ");
    let title = rawText
      .replace(/\s+—\s+@(.+?)(?=\s+#(?:исполнитель|assignee)\/|\s+📅|\s+✅|$)/iu, "")
      .replace(/#(?:исполнитель|assignee)\/[^\s#]+/giu, "")
      .replace(/📅\s*\d{4}-\d{2}-\d{2}/gu, "")
      .replace(/✅\s*\d{4}-\d{2}-\d{2}/gu, "")
      .replace(/(?:Отв\.?|Ответственный|Assignee|Owner):\s*(.+?)(?=\s*(?:📅|✅|⏳|🛫|➕|🔁|❌|$))/iu, "")
      .replace(/\s+/g, " ").replace(/[.\s]+$/g, "").trim();
    if (!title) title = rawText;
    const status = /[xX]/.test(marker) ? "done" : marker === " " ? "open" : marker === "-" ? "cancelled" : "other";
    return {
      id: `${file.path}:${index + 1}`,
      title, assignee, assigneeTag, due, doneDate,
      source: file.basename, path: file.path, line: index + 1,
      revision: this.revision(line), status,
      overdue: status === "open" && Boolean(due) && due < today
    };
  }

  async collectTasks() {
    const tasks = [];
    const today = localISODate();
    const files = this.app.vault.getMarkdownFiles().filter((file) => this.includesPath(file.path));
    for (const file of files) {
      const lines = (await this.app.vault.cachedRead(file)).split(/\r?\n/);
      lines.forEach((line, index) => {
        const task = this.parseTask(file, line, index, today);
        if (task) tasks.push(task);
      });
    }
    return tasks;
  }

  async appendTask(task, targetPath) {
    const title = String(task?.title ?? "").trim();
    if (!title) throw new Error(this.t("error.taskTitleRequired"));
    let path = cleanFolder(targetPath, this.t);
    if (!path) throw new Error(this.t("error.taskFileRequired"));
    if (!/\.md$/i.test(path)) path += ".md";
    path = normalizePath(path);
    if (!this.includesPath(path)) throw new Error(this.t("error.taskFileOutside"));
    const line = renderTasks([{ title, assignee: task.assignee, due: task.due }], this.t("task.assigneeTag"));
    const slash = path.lastIndexOf("/");
    await this.ensureFolder(slash >= 0 ? path.slice(0, slash) : "");
    let file = this.app.vault.getAbstractFileByPath(path);
    if (!file) {
      file = await this.app.vault.create(path, `# ${this.t("task.inboxHeading")}\n\n${line}\n`);
    } else {
      await this.app.vault.process(file, (content) => `${content.trimEnd()}\n\n${line}\n`);
    }
    return { file, path, line };
  }

  async updateStatus(task, status) {
    if (!["open", "done", "cancelled"].includes(status)) throw new Error(this.t("error.invalidTaskStatus"));
    if (!this.includesPath(task.path)) throw new Error(this.t("error.taskOutside"));
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!file) throw new Error(this.t("error.sourceMissing"));
    await this.app.vault.process(file, (content) => {
      const lines = content.split(/\r?\n/);
      const originalLine = lines[task.line - 1];
      const match = originalLine?.match(/^(\s*-\s+\[)([^\]])(\]\s+.+)$/u);
      if (!match) throw new Error(this.t("error.taskLineMissing"));
      if (this.revision(originalLine) !== task.revision) throw new Error(this.t("error.taskChanged"));
      const marker = status === "done" ? "x" : status === "cancelled" ? "-" : " ";
      let updated = `${match[1]}${marker}${match[3]}`.replace(/\s*✅\s*\d{4}-\d{2}-\d{2}/gu, "").trimEnd();
      if (status === "done") updated += ` ✅ ${localISODate()}`;
      lines[task.line - 1] = updated;
      return lines.join("\n");
    });
  }

  async openTask(task) {
    const file = this.app.vault.getAbstractFileByPath(task.path);
    if (!file) throw new Error(this.t("error.sourceMissing"));
    await this.app.workspace.getLeaf("tab").openFile(file);
  }

  async ensureFolder(path) {
    if (!path) return;
    let current = "";
    for (const part of path.split("/")) {
      current = current ? `${current}/${part}` : part;
      if (!this.app.vault.getAbstractFileByPath(current)) await this.app.vault.createFolder(current);
    }
  }
}

module.exports = { MeetingService, TaskService, localISODate, MEETING_ROOT, MEETING_LOG_ROOT, BUILTIN_TEMPLATE_FILENAME };
