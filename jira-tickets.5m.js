#!/opt/homebrew/bin/node
// <xbar.title>Jira Tickets</xbar.title>
// <xbar.version>v2.0.0</xbar.version>
// <xbar.author>Jun</xbar.author>
// <xbar.desc>Jira 티켓 상태를 macOS 메뉴바에서 확인</xbar.desc>
// <xbar.abouturl>https://github.com/agopwns/jira-menubar</xbar.abouturl>
// <xbar.dependencies>node</xbar.dependencies>
// SwiftBar 플러그인: 5분마다 갱신. 메뉴바=내 Jira 티켓 수, 클릭=섹션별 티켓 목록.

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const zlib = require("node:zlib");
const { execFileSync } = require("node:child_process");

const version = "v2.0.0";
const requestTimeoutMs = 10000;
const fields =
  "summary,status,priority,issuetype,updated,created,assignee,duedate,parent";
const tokenUrl = "https://id.atlassian.com/manage-profile/security/api-tokens";
const statusBucketDefaults = {
  urgent: ["검토 중", "dev request"],
  inProgress: ["진행 중"],
  planned: ["계획 중"],
};
const transitionTargetDefaults = [
  {
    label: "▶ 진행 중으로",
    status: "진행 중",
  },
  {
    label: "🧪 테스트로",
    status: "테스트",
  },
  {
    label: "✅ 완료 처리",
    status: "완료",
  },
];
const sectionTitleIds = [
  "urgent",
  "inProgress",
  "planned",
  "movedByOthers",
  "newTickets",
  "otherMine",
];
const priorityRanks = {
  Highest: 5,
  High: 4,
  Medium: 3,
  Low: 2,
  Lowest: 1,
};
const hexColorPattern = /^#[0-9a-fA-F]{6}$/;
const itemFontNames = new Set(["", "Menlo", "SFMono-Regular"]);
const mineSectionIds = new Set([
  "urgent",
  "inProgress",
  "planned",
  "otherMine",
]);
const styleDefaults = {
  outline: true,
  ansi: true,
  priorityMarker: true,
  groupByParent: false,
  menubarGlyphScale: 3,
  menubarHeight: 32,
  menubarStroke: 1,
  menubarPadding: 16,
  menubarPaddingV: 4,
  menubarRadius: 4,
  menubarShape: "rounded",
  menubarFilled: false,
  menubarRotate: false,
  summaryLength: 46,
  itemFont: "",
  sizes: {
    menubar: 12,
    header: 11,
    item: 13,
    footer: 10,
  },
  colors: {
    menubar: "",
    urgent: "#e5534b",
    header: "#8b949e",
    key: "#79c0ff",
    status: "#d29922",
    summary: "",
    assignee: "#8b949e",
    dim: "#8b949e",
    error: "#e5534b",
  },
};
const settableConfigPaths = new Set([
  "style.outline",
  "style.ansi",
  "style.menubarGlyphScale",
  "style.menubarHeight",
  "style.menubarStroke",
  "style.menubarPadding",
  "style.menubarPaddingV",
  "style.menubarRadius",
  "style.menubarShape",
  "style.menubarFilled",
  "style.menubarRotate",
  "style.summaryLength",
  "style.itemFont",
  "style.priorityMarker",
  "style.groupByParent",
  "style.sizes.menubar",
  "style.sizes.header",
  "style.sizes.item",
  "style.sizes.footer",
  "style.colors.menubar",
  "style.colors.key",
  "style.colors.status",
  "style.colors.summary",
  "style.colors.assignee",
  "style.colors.header",
  "style.colors.urgent",
  "newTicketDays",
  "notifications",
  "briefing",
]);
const menuImageScale = 2;
const menuImageDpi = 144;
const menuGlyphSpacing = 2;
const menuBoxMargin = 3;
const menuBubbleTailHeight = 5;
const menubarShapeNames = new Set([
  "rounded",
  "pill",
  "square",
  "ticket",
  "bubble",
]);
const menuGlyphs = {
  J: ["1111", "0010", "0010", "0010", "1010", "0100"],
  0: ["0110", "1001", "1001", "1001", "1001", "0110"],
  1: ["0010", "0110", "0010", "0010", "0010", "0111"],
  2: ["0110", "1001", "0010", "0100", "1000", "1111"],
  3: ["1110", "0001", "0110", "0001", "1001", "0110"],
  4: ["0010", "0110", "1010", "1111", "0010", "0010"],
  5: ["1111", "1000", "1110", "0001", "1001", "0110"],
  6: ["0110", "1000", "1110", "1001", "1001", "0110"],
  7: ["1111", "0001", "0010", "0100", "0100", "0100"],
  8: ["0110", "1001", "0110", "1001", "1001", "0110"],
  9: ["0110", "1001", "1001", "0111", "0001", "0110"],
  "·": ["0", "0", "0", "1", "0", "0"],
  "!": ["1", "1", "1", "1", "0", "1"],
};
const pngCrcTable = (() => {
  const table = new Uint32Array(256);

  for (let n = 0; n < 256; n++) {
    let crc = n;
    for (let k = 0; k < 8; k++) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
    table[n] = crc >>> 0;
  }

  return table;
})();

function getConfigPath() {
  return (
    process.env.JIRA_MENUBAR_CONFIG ||
    path.join(os.homedir(), ".config", "jira-menubar", "config.json")
  );
}

function getCacheDir() {
  return (
    process.env.JIRA_MENUBAR_CACHE_DIR ||
    path.join(os.homedir(), ".cache", "jira-menubar")
  );
}

function getCacheOutputPath() {
  return path.join(getCacheDir(), "last.txt");
}

function getCacheTimestampPath() {
  return path.join(getCacheDir(), "last.timestamp");
}

function getNotifyStatePath() {
  return path.join(getCacheDir(), "notify-state.json");
}

function getSeenPath() {
  return path.join(getCacheDir(), "seen.json");
}

function runConfigSetter() {
  if (process.argv.length !== 5) {
    return 1;
  }

  const dottedPath = process.argv[3];
  const rawValue = process.argv[4];

  if (!settableConfigPaths.has(dottedPath)) {
    return 1;
  }

  try {
    const configPath = getConfigPath();
    const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

    if (!isPlainObject(config)) {
      return 1;
    }

    setNestedConfigValue(
      config,
      dottedPath,
      coerceConfigSetterValue(dottedPath, rawValue),
    );
    fs.writeFileSync(
      configPath,
      `${JSON.stringify(config, null, 2)}\n`,
      "utf8",
    );
    fs.chmodSync(configPath, 0o600);
    return 0;
  } catch {
    return 1;
  }
}

function runSeenSetter() {
  if (process.argv.length !== 5) {
    return 1;
  }

  const key = String(process.argv[3] || "").trim();
  const updatedIso = String(process.argv[4] || "").trim();

  if (!key || !Number.isFinite(Date.parse(updatedIso))) {
    return 1;
  }

  try {
    const seen = readSeenStore();
    mergeSeenEntry(seen, key, updatedIso);
    pruneSeenStore(seen);
    writeSeenStore(seen);
    return 0;
  } catch {
    return 1;
  }
}

function runSeenAll() {
  if (process.argv.length !== 3) {
    return 1;
  }

  try {
    const seen = readSeenStore();
    const state = readJsonObject(getNotifyStatePath(), {});
    const moved = isPlainObject(state.moved) ? state.moved : {};

    for (const [key, updatedIso] of Object.entries(moved)) {
      if (!key || !Number.isFinite(Date.parse(updatedIso))) {
        continue;
      }
      mergeSeenEntry(seen, key, updatedIso);
    }

    pruneSeenStore(seen);
    writeSeenStore(seen);
    return 0;
  } catch {
    return 1;
  }
}

async function runTransition() {
  if (process.argv.length !== 5) {
    return 1;
  }

  const key = String(process.argv[3] || "").trim();
  const targetStatusName = String(process.argv[4] || "").trim();

  if (!key || !targetStatusName) {
    return 1;
  }

  const configResult = readConfig();
  if (configResult.setup) {
    return 1;
  }

  const { config } = configResult;
  if (!config.baseUrl || !config.email || !config.apiToken) {
    return 1;
  }

  try {
    const transitions = await fetchIssueTransitions(config, key);
    const transition = transitions.find(
      (item) => item?.to?.name === targetStatusName,
    );

    if (!transition) {
      sendNotification(
        `전이 불가: ${key}`,
        `현재 상태에서 '${targetStatusName}' 전이 없음`,
      );
      return 0;
    }

    await postIssueTransition(config, key, transition.id);
    sendNotification(`✅ ${key} → ${targetStatusName}`, targetStatusName);
    return 0;
  } catch (error) {
    sendNotification(`⚠ 전이 실패: ${key}`, shortMessage(error));
    return 0;
  }
}

function coerceConfigSetterValue(dottedPath, rawValue) {
  if (
    (dottedPath.startsWith("style.colors.") ||
      dottedPath === "style.itemFont") &&
    rawValue === "default"
  ) {
    return "";
  }

  if (rawValue === "true") {
    return true;
  }

  if (rawValue === "false") {
    return false;
  }

  const trimmed = rawValue.trim();
  if (trimmed && /^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(trimmed)) {
    return Number(trimmed);
  }

  return rawValue;
}

function setNestedConfigValue(config, dottedPath, value) {
  const parts = dottedPath.split(".");
  let cursor = config;

  for (let index = 0; index < parts.length - 1; index++) {
    const key = parts[index];

    if (!isPlainObject(cursor[key])) {
      cursor[key] = {};
    }

    cursor = cursor[key];
  }

  cursor[parts[parts.length - 1]] = value;
}

if (process.argv[2] === "set") {
  process.exit(runConfigSetter());
}

if (process.argv[2] === "seen") {
  process.exit(runSeenSetter());
}

if (process.argv[2] === "seen-all") {
  process.exit(runSeenAll());
}

function readConfig() {
  const configPath = getConfigPath();

  let text;
  try {
    text = fs.readFileSync(configPath, "utf8");
  } catch (error) {
    if (error?.code === "ENOENT") {
      return { setup: true };
    }
    return {
      setup: true,
      message: `설정 파일 읽기 실패: ${shortMessage(error)}`,
    };
  }

  let config;
  try {
    config = JSON.parse(text);
  } catch (error) {
    return {
      setup: true,
      message: `설정 JSON 파싱 실패: ${shortMessage(error)}`,
    };
  }

  if (!String(config.apiToken || "").trim()) {
    return { setup: true };
  }

  return { config: normalizeConfig(config) };
}

function normalizeConfig(config) {
  const newTicketDays = Number(config.newTicketDays);

  return {
    baseUrl: String(config.baseUrl || "").replace(/\/+$/, ""),
    email: String(config.email || ""),
    apiToken: String(config.apiToken || ""),
    myAccountId: String(config.myAccountId || ""),
    projects: Array.isArray(config.projects)
      ? config.projects.map((project) => String(project)).filter(Boolean)
      : [],
    newTicketDays:
      Number.isFinite(newTicketDays) && newTicketDays >= 0
        ? Math.floor(newTicketDays)
        : 3,
    notifications:
      typeof config.notifications === "boolean" ? config.notifications : true,
    briefing: typeof config.briefing === "boolean" ? config.briefing : true,
    statusBuckets: normalizeStatusBuckets(config.statusBuckets),
    transitionTargets: normalizeTransitionTargets(config.transitionTargets),
    sectionTitles: normalizeSectionTitles(config.sectionTitles),
    customSections: normalizeCustomSections(config.customSections),
    style: normalizeStyle(config.style),
  };
}

function normalizeStatusBuckets(statusBuckets) {
  const value = isPlainObject(statusBuckets) ? statusBuckets : {};

  return Object.fromEntries(
    Object.entries(statusBucketDefaults).map(([id, fallback]) => {
      if (
        !Array.isArray(value[id]) ||
        value[id].length === 0 ||
        value[id].some(
          (name) => typeof name !== "string" || !name.trim(),
        )
      ) {
        return [id, [...fallback]];
      }

      return [id, value[id].map((name) => name.trim())];
    }),
  );
}

function normalizeTransitionTargets(transitionTargets) {
  if (!Array.isArray(transitionTargets)) {
    return transitionTargetDefaults.map((target) => ({ ...target }));
  }

  const normalized = [];

  for (const target of transitionTargets) {
    if (normalized.length >= 6) {
      break;
    }
    if (!isPlainObject(target)) {
      continue;
    }

    const label =
      typeof target.label === "string" ? target.label.trim() : "";
    const status =
      typeof target.status === "string" ? target.status.trim() : "";

    if (label && status) {
      normalized.push({ label, status });
    }
  }

  return normalized;
}

function normalizeSectionTitles(sectionTitles) {
  const value = isPlainObject(sectionTitles) ? sectionTitles : {};
  const normalized = {};

  for (const id of sectionTitleIds) {
    const title = typeof value[id] === "string" ? value[id].trim() : "";
    if (title) {
      normalized[id] = title;
    }
  }

  return normalized;
}

function normalizeCustomSections(customSections) {
  if (!Array.isArray(customSections)) {
    return [];
  }

  const normalized = [];

  for (const section of customSections) {
    if (normalized.length >= 5) {
      break;
    }
    if (!isPlainObject(section)) {
      continue;
    }

    const jql = typeof section.jql === "string" ? section.jql.trim() : "";
    if (!jql) {
      continue;
    }

    const title =
      typeof section.title === "string" && section.title.trim()
        ? section.title.trim()
        : "커스텀";
    normalized.push({
      title,
      jql,
      maxResults: normalizeStyleInteger(section.maxResults, 10, 1, 25),
      showStatus:
        typeof section.showStatus === "boolean" ? section.showStatus : true,
      showAssignee:
        typeof section.showAssignee === "boolean"
          ? section.showAssignee
          : false,
    });
  }

  return normalized;
}

function normalizeStyle(style) {
  const value = isPlainObject(style) ? style : {};

  return {
    outline:
      typeof value.outline === "boolean"
        ? value.outline
        : styleDefaults.outline,
    ansi: typeof value.ansi === "boolean" ? value.ansi : styleDefaults.ansi,
    priorityMarker:
      typeof value.priorityMarker === "boolean"
        ? value.priorityMarker
        : styleDefaults.priorityMarker,
    groupByParent:
      typeof value.groupByParent === "boolean"
        ? value.groupByParent
        : styleDefaults.groupByParent,
    menubarGlyphScale: normalizeStyleInteger(
      value.menubarGlyphScale,
      styleDefaults.menubarGlyphScale,
      2,
      5,
    ),
    menubarHeight: normalizeStyleInteger(
      value.menubarHeight,
      styleDefaults.menubarHeight,
      24,
      44,
    ),
    menubarStroke: normalizeStyleInteger(
      value.menubarStroke,
      styleDefaults.menubarStroke,
      1,
      4,
    ),
    menubarPadding: normalizeStyleInteger(
      value.menubarPadding,
      styleDefaults.menubarPadding,
      4,
      32,
    ),
    menubarPaddingV: normalizeStyleInteger(
      value.menubarPaddingV,
      styleDefaults.menubarPaddingV,
      0,
      16,
    ),
    menubarRadius: normalizeStyleInteger(
      value.menubarRadius,
      styleDefaults.menubarRadius,
      0,
      10,
    ),
    menubarShape: normalizeMenubarShape(value.menubarShape),
    menubarFilled:
      typeof value.menubarFilled === "boolean"
        ? value.menubarFilled
        : styleDefaults.menubarFilled,
    menubarRotate:
      typeof value.menubarRotate === "boolean"
        ? value.menubarRotate
        : styleDefaults.menubarRotate,
    summaryLength: normalizeStyleInteger(
      value.summaryLength,
      styleDefaults.summaryLength,
      20,
      120,
    ),
    itemFont: normalizeStyleItemFont(value.itemFont),
    sizes: normalizeStyleSizes(value.sizes),
    colors: normalizeStyleColors(value.colors),
  };
}

function normalizeStyleInteger(value, fallback, min, max) {
  const size = Number(value);

  if (!Number.isFinite(size)) {
    return fallback;
  }

  return Math.max(min, Math.min(max, Math.round(size)));
}

function normalizeMenubarShape(value) {
  return menubarShapeNames.has(value) ? value : styleDefaults.menubarShape;
}

function normalizeStyleSizes(sizes) {
  const value = isPlainObject(sizes) ? sizes : {};

  return Object.fromEntries(
    Object.entries(styleDefaults.sizes).map(([key, fallback]) => [
      key,
      normalizeStyleSize(value[key], fallback),
    ]),
  );
}

function normalizeStyleSize(value, fallback) {
  const size = Number(value);

  if (!Number.isFinite(size)) {
    return fallback;
  }

  return Math.max(8, Math.min(20, Math.round(size)));
}

function normalizeStyleColors(colors) {
  const value = isPlainObject(colors) ? colors : {};

  return Object.fromEntries(
    Object.entries(styleDefaults.colors).map(([key, fallback]) => [
      key,
      normalizeStyleColor(value[key], fallback),
    ]),
  );
}

function normalizeStyleColor(value, fallback) {
  if (value === "") {
    return "";
  }

  const color = typeof value === "string" ? value : "";
  return hexColorPattern.test(color) ? color : fallback;
}

function normalizeStyleItemFont(value) {
  const font = typeof value === "string" ? value : "";
  return itemFontNames.has(font) ? font : styleDefaults.itemFont;
}

function isPlainObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readJsonObject(filePath, fallback = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return isPlainObject(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeJsonObject(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function readSeenStore() {
  const seen = readJsonObject(getSeenPath(), {});
  return Object.fromEntries(
    Object.entries(seen).filter(
      ([key, updatedIso]) =>
        key && typeof updatedIso === "string" && updatedIso.trim(),
    ),
  );
}

function writeSeenStore(seen) {
  writeJsonObject(getSeenPath(), seen);
}

function mergeSeenEntry(seen, key, updatedIso) {
  const existing = seen[key];

  if (!existing || compareIsoTimes(updatedIso, existing) > 0) {
    seen[key] = updatedIso;
  }
}

function pruneSeenStore(seen) {
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;

  for (const [key, updatedIso] of Object.entries(seen)) {
    const time = Date.parse(updatedIso);

    if (!Number.isFinite(time) || time < cutoff) {
      delete seen[key];
    }
  }
}

function getStyle(config) {
  return config?.style || styleDefaults;
}

function renderSetupState(message) {
  const lines = ["J⚙", "---", "Jira 설정 필요 | size=11 color=#8b949e"];

  if (message) {
    lines.push(`${escapeText(message)} | color=#e5534b`);
  }

  lines.push(
    `1. ${tokenUrl} 에서 API 토큰 생성 | href=${tokenUrl}`,
    "2. ~/.config/jira-menubar/config.json 의 apiToken 에 붙여넣기",
    "3. 새로고침",
    "---",
    "🔄 새로고침 | refresh=true",
  );

  return lines.join("\n");
}

function buildSectionDefs(config) {
  const projectJql = buildProjectJql(config.projects);
  const accountId = escapeJqlString(config.myAccountId);
  const days = config.newTicketDays;

  return [
    {
      id: "urgent",
      title: sectionTitle(config, "urgent", "🔥 즉시 처리"),
      maxResults: 25,
      priorityMarker: true,
      showStatus: true,
      showDueBadge: true,
    },
    {
      id: "inProgress",
      title: sectionTitle(config, "inProgress", "🚧 진행 중"),
      maxResults: 25,
      priorityMarker: true,
      showStatus: false,
      showDueBadge: true,
    },
    {
      id: "planned",
      title: sectionTitle(config, "planned", "📋 계획 중"),
      maxResults: 25,
      priorityMarker: true,
      showStatus: false,
      showDueBadge: true,
    },
    {
      id: "movedByOthers",
      title: sectionTitle(
        config,
        "movedByOthers",
        "🔔 남이 움직인 티켓 (7d)",
      ),
      jql: `assignee = currentUser() AND statusCategory != Done AND updated >= -7d AND NOT issue IN updatedBy("${accountId}", "-7d") ORDER BY updated DESC`,
      maxResults: 15,
      showStatus: true,
    },
    {
      id: "newTickets",
      title: sectionTitle(
        config,
        "newTickets",
        `🆕 새로 열린 티켓 (${days}d)`,
      ),
      jql: `${projectJql} AND created >= -${days}d ORDER BY created DESC`,
      maxResults: 15,
      showStatus: true,
      showAssignee: true,
    },
    {
      id: "otherMine",
      title: sectionTitle(config, "otherMine", "📦 기타 내 티켓"),
      maxResults: 15,
      showStatus: true,
    },
    ...config.customSections.map((section, index) => ({
      id: `customSection${index + 1}`,
      title: customSectionTitle(section.title),
      jql: section.jql,
      maxResults: section.maxResults,
      showStatus: section.showStatus,
      showAssignee: section.showAssignee,
      custom: true,
    })),
    {
      id: "stale",
      title: "🕸 스테일 (14d+)",
      maxResults: 25,
      showStatus: true,
      stale: true,
    },
  ];
}

function sectionTitle(config, id, fallback) {
  return config.sectionTitles?.[id] || fallback;
}

function customSectionTitle(title) {
  const chars = Array.from(String(title || ""));
  const firstCodePoint = chars[0]?.codePointAt(0) || 0;

  return firstCodePoint > 0x2000 ? title : `🔖 ${title}`;
}

function buildQueryDefs(sections) {
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const customQueries = sections
    .filter((section) => section.custom)
    .map((section) => ({
      id: section.id,
      section,
      jql: section.jql,
      maxResults: section.maxResults,
    }));

  return [
    {
      id: "mine",
      section: {
        id: "mine",
        title: "내 티켓",
      },
      jql: "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC",
      maxResults: 100,
    },
    {
      id: "movedByOthers",
      section: sectionMap.get("movedByOthers"),
      jql: sectionMap.get("movedByOthers").jql,
      maxResults: sectionMap.get("movedByOthers").maxResults,
    },
    {
      id: "newTickets",
      section: sectionMap.get("newTickets"),
      jql: sectionMap.get("newTickets").jql,
      maxResults: sectionMap.get("newTickets").maxResults,
    },
    {
      id: "stale",
      section: sectionMap.get("stale"),
      jql: "assignee = currentUser() AND statusCategory != Done AND updated <= -14d ORDER BY updated ASC",
      maxResults: 25,
    },
    {
      id: "doneRecent",
      section: {
        id: "doneRecent",
        title: "완료 통계",
      },
      jql: "assignee = currentUser() AND statusCategory = Done AND updated >= -7d",
      maxResults: 50,
    },
    ...customQueries,
  ];
}

function buildProjectJql(projects) {
  return `project in (${projects.map(formatJqlProject).join(", ")})`;
}

function formatJqlProject(project) {
  if (/^[A-Z][A-Z0-9_]*$/.test(project)) {
    return project;
  }

  return `"${escapeJqlString(project)}"`;
}

function escapeJqlString(value) {
  return String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"');
}

async function fetchQuery(config, query) {
  const issues = await searchIssues(config, query.jql, query.maxResults);
  return { query, issues };
}

async function searchIssues(config, jql, maxResults) {
  const headers = jiraAuthHeaders(config);

  let response = await fetchResponse(
    buildSearchUrl(config.baseUrl, "/rest/api/3/search/jql", jql, maxResults),
    headers,
  );

  if (response.status === 404 || response.status === 410) {
    response = await fetchResponse(
      buildSearchUrl(config.baseUrl, "/rest/api/3/search", jql, maxResults),
      headers,
    );
  }

  if (!response.ok) {
    throw new Error(await httpErrorMessage(response));
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`응답 JSON 파싱 실패: ${shortMessage(error)}`);
  }

  return Array.isArray(data.issues) ? data.issues : [];
}

async function fetchIssueTransitions(config, key) {
  const response = await fetchResponse(
    buildIssueTransitionsUrl(config.baseUrl, key),
    jiraAuthHeaders(config),
  );

  if (!response.ok) {
    throw new Error(await httpErrorMessage(response));
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`응답 JSON 파싱 실패: ${shortMessage(error)}`);
  }

  return Array.isArray(data.transitions) ? data.transitions : [];
}

async function fetchIssueComments(config, key) {
  const response = await fetchResponse(
    buildIssueCommentsUrl(config.baseUrl, key),
    jiraAuthHeaders(config),
  );

  if (!response.ok) {
    throw new Error(await httpErrorMessage(response));
  }

  let data;
  try {
    data = await response.json();
  } catch (error) {
    throw new Error(`응답 JSON 파싱 실패: ${shortMessage(error)}`);
  }

  return Array.isArray(data.comments) ? data.comments : [];
}

async function postIssueTransition(config, key, transitionId) {
  const response = await fetchResponse(
    buildIssueTransitionsUrl(config.baseUrl, key),
    jiraAuthHeaders(config, {
      "Content-Type": "application/json",
    }),
    {
      method: "POST",
      body: JSON.stringify({
        transition: {
          id: String(transitionId || ""),
        },
      }),
    },
  );

  if (!response.ok) {
    throw new Error(await httpErrorMessage(response));
  }
}

function jiraAuthHeaders(config, extraHeaders = {}) {
  const auth = Buffer.from(`${config.email}:${config.apiToken}`).toString(
    "base64",
  );

  return {
    Authorization: `Basic ${auth}`,
    Accept: "application/json",
    ...extraHeaders,
  };
}

function buildIssueTransitionsUrl(baseUrl, key) {
  return new URL(
    `/rest/api/3/issue/${encodeURIComponent(key)}/transitions`,
    `${baseUrl}/`,
  );
}

function buildIssueCommentsUrl(baseUrl, key) {
  const url = new URL(
    `/rest/api/3/issue/${encodeURIComponent(key)}/comment`,
    `${baseUrl}/`,
  );
  url.searchParams.set("orderBy", "-created");
  url.searchParams.set("maxResults", "5");
  return url;
}

function buildSearchUrl(baseUrl, endpoint, jql, maxResults) {
  const url = new URL(endpoint, `${baseUrl}/`);
  url.searchParams.set("jql", jql);
  url.searchParams.set("maxResults", String(maxResults));
  url.searchParams.set("fields", fields);
  return url;
}

async function fetchResponse(url, headers, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), requestTimeoutMs);

  try {
    return await fetch(url, {
      ...options,
      headers,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("요청 시간 초과");
    }
    throw new Error(shortMessage(error));
  } finally {
    clearTimeout(timeout);
  }
}

async function httpErrorMessage(response) {
  const statusText = response.statusText ? ` ${response.statusText}` : "";
  return `HTTP ${response.status}${statusText}`;
}

function buildSectionResults(
  sections,
  queryResults,
  seen = {},
  statusBuckets = statusBucketDefaults,
) {
  const sectionMap = new Map(sections.map((section) => [section.id, section]));
  const queryMap = new Map(
    queryResults.map((result) => [result.query.id, result]),
  );
  const mineResult = queryMap.get("mine");
  const mineBuckets = mineResult?.ok
    ? bucketMineIssues(sectionMap, mineResult.issues, statusBuckets)
    : null;
  const sectionResults = [];

  if (mineBuckets) {
    sectionResults.push(
      mineBuckets.get("urgent"),
      mineBuckets.get("inProgress"),
      mineBuckets.get("planned"),
    );
  } else {
    sectionResults.push(queryResultToSectionResult(mineResult));
  }

  sectionResults.push(
    filterSeenMovedIssues(
      queryResultToSectionResult(queryMap.get("movedByOthers")),
      seen,
    ),
    queryResultToSectionResult(queryMap.get("newTickets")),
  );

  if (mineBuckets) {
    sectionResults.push(mineBuckets.get("otherMine"));
  }

  sectionResults.push(
    ...sections
      .filter((section) => section.custom)
      .map((section) => queryResultToSectionResult(queryMap.get(section.id))),
  );

  const staleResult = queryResultToSectionResult(queryMap.get("stale"));
  if (staleResult) {
    sectionResults.push(staleResult);
  }

  return sectionResults.filter(Boolean);
}

function queryResultToSectionResult(result) {
  if (!result) {
    return null;
  }

  if (result.ok) {
    return {
      ok: true,
      section: result.query.section,
      issues: result.issues,
    };
  }

  return {
    ok: false,
    section: result.query.section,
    error: result.error,
  };
}

function filterSeenMovedIssues(result, seen) {
  if (!result?.ok || result.section.id !== "movedByOthers") {
    return result;
  }

  return {
    ...result,
    issues: result.issues.filter((issue) => !isSeenMovedIssue(seen, issue)),
  };
}

function isSeenMovedIssue(seen, issue) {
  const key = issue.key || "";
  const updatedIso = issue.fields?.updated || "";
  const seenIso = seen[key];

  return !!seenIso && compareIsoTimes(seenIso, updatedIso) >= 0;
}

async function detectRecentComments(
  config,
  sectionResults,
  previousComments,
  now,
) {
  const movedResult = sectionResults.find(
    (result) => result.section.id === "movedByOthers",
  );
  const issues = movedResult?.ok ? movedResult.issues.slice(0, 10) : [];
  const commentsState = isPlainObject(previousComments)
    ? { ...previousComments }
    : {};
  const newCommentKeys = new Set();
  const notifications = [];

  const settled = await Promise.allSettled(
    issues.map(async (issue) => ({
      issue,
      comments: await fetchIssueComments(config, issue.key || ""),
    })),
  );

  for (const result of settled) {
    if (result.status !== "fulfilled") {
      continue;
    }

    const { issue, comments } = result.value;
    const key = issue.key || "";
    if (!key) {
      continue;
    }

    const nonMine = comments
      .filter(
        (comment) =>
          comment?.author?.accountId &&
          comment.author.accountId !== config.myAccountId &&
          Number.isFinite(Date.parse(comment.created || "")),
      )
      .sort((left, right) => compareIsoTimes(right.created, left.created));
    const latest = nonMine[0];

    if (!latest) {
      continue;
    }

    const previousIso = String(commentsState[key] || "");
    const latestCreated = latest.created;
    const isNew = previousIso
      ? compareIsoTimes(latestCreated, previousIso) > 0
      : Date.parse(latestCreated) >= now.getTime() - 24 * 60 * 60 * 1000;

    commentsState[key] = latestCreated;

    if (!isNew) {
      continue;
    }

    newCommentKeys.add(key);
    const mentioned =
      !!config.myAccountId &&
      String(JSON.stringify(latest.body || "")).includes(config.myAccountId);
    const author = escapeText(
      latest.author?.displayName || "알 수 없는 사용자",
    );
    const snippet = truncateNotificationText(adfPlainText(latest.body), 60);
    notifications.push({
      key,
      title: `${mentioned ? "📣 멘션" : "💬 새 코멘트"}: ${key}`,
      body: `${author}: ${snippet}`,
    });
  }

  return {
    comments: commentsState,
    newCommentKeys,
    notifications,
  };
}

function adfPlainText(value) {
  const texts = [];

  const walk = (node) => {
    if (!node || typeof node !== "object") {
      return;
    }
    if (typeof node.text === "string") {
      texts.push(node.text);
    }
    if (Array.isArray(node)) {
      for (const child of node) {
        walk(child);
      }
      return;
    }
    for (const child of Object.values(node)) {
      walk(child);
    }
  };

  walk(value);
  return texts.join(" ").replace(/\s+/g, " ").trim();
}

function bucketMineIssues(sectionMap, issues, statusBuckets) {
  const buckets = new Map([
    ["urgent", []],
    ["inProgress", []],
    ["planned", []],
    ["otherMine", []],
  ]);

  for (const issue of issues) {
    buckets.get(mineBucketId(issue, statusBuckets)).push(issue);
  }

  buckets.get("urgent").sort(compareDueDateThen(compareUpdatedAsc));
  buckets
    .get("inProgress")
    .sort(compareDueDateThen(comparePriorityThenUpdatedDesc));
  buckets
    .get("planned")
    .sort(compareDueDateThen(comparePriorityThenUpdatedDesc));

  const mineTotalCount = countUniqueIssues(issues);
  return new Map(
    Array.from(buckets, ([id, bucketIssues]) => [
      id,
      buildBucketResult(sectionMap.get(id), bucketIssues, mineTotalCount),
    ]),
  );
}

function mineBucketId(issue, statusBuckets = statusBucketDefaults) {
  const statusName = issue.fields?.status?.name || "";

  if (statusBuckets.urgent.includes(statusName)) {
    return "urgent";
  }

  if (statusBuckets.inProgress.includes(statusName)) {
    return "inProgress";
  }

  if (statusBuckets.planned.includes(statusName)) {
    return "planned";
  }

  return "otherMine";
}

function buildBucketResult(section, issues, mineTotalCount) {
  const displayIssues = issues.slice(0, section.maxResults);

  return {
    ok: true,
    section,
    issues: displayIssues,
    totalCount: issues.length,
    overflowCount: Math.max(0, issues.length - displayIssues.length),
    mineTotalCount,
  };
}

function compareUpdatedAsc(left, right) {
  return issueUpdatedTime(left) - issueUpdatedTime(right);
}

function comparePriorityThenUpdatedDesc(left, right) {
  const priorityDiff = priorityRank(right) - priorityRank(left);

  if (priorityDiff !== 0) {
    return priorityDiff;
  }

  return issueUpdatedTime(right) - issueUpdatedTime(left);
}

function compareDueDateThen(fallbackCompare) {
  return (left, right) => {
    const leftDue = issueDueDateTime(left);
    const rightDue = issueDueDateTime(right);
    const leftHasDue = Number.isFinite(leftDue);
    const rightHasDue = Number.isFinite(rightDue);

    if (leftHasDue && rightHasDue && leftDue !== rightDue) {
      return leftDue - rightDue;
    }

    if (leftHasDue !== rightHasDue) {
      return leftHasDue ? -1 : 1;
    }

    return fallbackCompare(left, right);
  };
}

function priorityRank(issue) {
  return priorityRanks[issue.fields?.priority?.name] || 0;
}

function issueUpdatedTime(issue) {
  const time = Date.parse(issue.fields?.updated || "");
  return Number.isFinite(time) ? time : 0;
}

function issueDueDateTime(issue) {
  return localDateOnlyTime(issue.fields?.duedate || "");
}

function localDateOnlyTime(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ""));

  if (!match) {
    return NaN;
  }

  return new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  ).getTime();
}

function compareIsoTimes(leftIso, rightIso) {
  const leftTime = Date.parse(leftIso || "");
  const rightTime = Date.parse(rightIso || "");

  if (Number.isFinite(leftTime) && Number.isFinite(rightTime)) {
    return leftTime - rightTime;
  }

  return String(leftIso || "").localeCompare(String(rightIso || ""));
}

function renderMenuBarLine(menuTitle, style) {
  if (style.outline) {
    try {
      const image = renderMenuBarImage(menuTitle, style);
      return `| ${image.param}=${image.base64}`;
    } catch {}
  }

  if (menuTitle.urgentSuffix && style.ansi) {
    return lineWithParams(
      [
        paint(menuTitle.base, style.colors.menubar, style),
        paint(menuTitle.urgentSuffix, style.colors.urgent, style),
      ].join(""),
      [sizeParam(style.sizes.menubar), "font=Menlo", "ansi=true"],
    );
  }

  return lineWithParams(
    menuTitleText(menuTitle),
    menuTextParams(!!menuTitle.urgentSuffix, style),
  );
}

function menuTextParams(urgent, style) {
  const color = urgent ? style.colors.urgent : style.colors.menubar;
  return [sizeParam(style.sizes.menubar), "font=Menlo", colorParam(color)];
}

function renderMenuBarImage(menuTitle, style) {
  const baseColorHex = menuBaseColorHex(menuTitle, style);
  const baseColor = baseColorHex ? hexToRgba(baseColorHex) : [0, 0, 0, 255];
  const urgentColor = menuTitle.urgentSuffix
    ? hexToRgba(style.colors.urgent || styleDefaults.colors.urgent)
    : baseColor;
  const base64 = drawMenuBarPng(
    menuTitle,
    baseColor,
    urgentColor,
    style,
  ).toString("base64");

  return {
    param: menuTitle.urgentSuffix || baseColorHex ? "image" : "templateImage",
    base64,
  };
}

function menuBaseColorHex(menuTitle, style) {
  if (style.colors.menubar) {
    return style.colors.menubar;
  }

  if (menuTitle.urgentSuffix) {
    return process.env.OS_APPEARANCE === "Light" ? "#000000" : "#ffffff";
  }

  return "";
}

function menuTitleText(menuTitle) {
  return `${menuTitle.base}${menuTitle.urgentSuffix}`;
}

function drawMenuBarPng(menuTitle, baseColor, urgentColor, style) {
  const shape = normalizeMenubarShape(style?.menubarShape);
  const minHeight = normalizeStyleInteger(
    style?.menubarHeight,
    styleDefaults.menubarHeight,
    24,
    44,
  );
  const stroke = normalizeStyleInteger(
    style?.menubarStroke,
    styleDefaults.menubarStroke,
    1,
    4,
  );
  const radius = normalizeStyleInteger(
    style?.menubarRadius,
    styleDefaults.menubarRadius,
    0,
    10,
  );
  const sidePadding = normalizeStyleInteger(
    style?.menubarPadding,
    styleDefaults.menubarPadding,
    4,
    32,
  );
  const verticalPadding = normalizeStyleInteger(
    style?.menubarPaddingV,
    styleDefaults.menubarPaddingV,
    0,
    16,
  );
  const strokeForLayout = style?.menubarFilled ? 0 : stroke;
  const requestedGlyphScale = normalizeStyleInteger(
    style?.menubarGlyphScale,
    styleDefaults.menubarGlyphScale,
    2,
    5,
  );
  const layout = fitMenuBarLayout(
    requestedGlyphScale,
    minHeight,
    verticalPadding,
    strokeForLayout,
  );
  const boxImageHeight = layout.height;
  const tailHeight = shape === "bubble" ? menuBubbleTailHeight : 0;
  const height = boxImageHeight + tailHeight;
  const glyphScale = layout.glyphScale;
  const glyphSpacing = menuGlyphSpacingForScale(glyphScale);
  const text = menuTitleText(menuTitle);
  const textWidth = menuTextWidth(text, glyphScale, glyphSpacing);
  const minWidth = Math.max(
    24 * menuImageScale,
    Math.round(boxImageHeight * 1.5),
  );
  const width = Math.max(minWidth, textWidth + sidePadding * 2);
  const rgba = Buffer.alloc(width * height * 4, 0);
  const boxX = 1;
  const boxY = menuBoxMargin;
  const boxWidth = width - 2;
  const boxHeight = boxImageHeight - menuBoxMargin * 2;
  const textX = Math.floor((width - textWidth) / 2);
  const textY = Math.floor(
    (boxImageHeight - menuGlyphHeight() * glyphScale) / 2,
  );

  if (style?.menubarFilled) {
    drawMenuBarShapeFill(
      rgba,
      width,
      height,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      baseColor,
      shape,
      radius,
    );
    drawMenuTitleText(
      rgba,
      width,
      height,
      menuTitle,
      textX,
      textY,
      [0, 0, 0, 0],
      urgentColor,
      glyphScale,
      glyphSpacing,
    );
  } else {
    drawMenuBarShapeStroke(
      rgba,
      width,
      height,
      boxX,
      boxY,
      boxWidth,
      boxHeight,
      baseColor,
      stroke,
      shape,
      radius,
    );
    drawMenuTitleText(
      rgba,
      width,
      height,
      menuTitle,
      textX,
      textY,
      baseColor,
      urgentColor,
      glyphScale,
      glyphSpacing,
    );
  }

  return encodePng(width, height, rgba, menuImageDpi);
}

function fitMenuBarLayout(
  requestedGlyphScale,
  minHeight,
  verticalPadding,
  strokeForLayout,
) {
  let glyphScale = requestedGlyphScale;

  while (true) {
    const height = Math.max(
      minHeight,
      menuGlyphHeight() * glyphScale + verticalPadding * 2 + menuBoxMargin * 2,
    );
    const fittedGlyphScale = fitMenuGlyphScale(
      glyphScale,
      height,
      strokeForLayout,
    );

    if (fittedGlyphScale === glyphScale) {
      return {
        height,
        glyphScale,
      };
    }

    glyphScale = fittedGlyphScale;
  }
}

function drawMenuTitleText(
  rgba,
  width,
  height,
  menuTitle,
  x,
  y,
  baseColor,
  urgentColor,
  glyphScale,
  glyphSpacing,
) {
  drawMenuText(
    rgba,
    width,
    height,
    menuTitle.base,
    x,
    y,
    baseColor,
    glyphScale,
    glyphSpacing,
  );

  if (!menuTitle.urgentSuffix) {
    return;
  }

  const suffixX =
    x + menuTextWidth(menuTitle.base, glyphScale, glyphSpacing) + glyphSpacing;
  drawMenuText(
    rgba,
    width,
    height,
    menuTitle.urgentSuffix,
    suffixX,
    y,
    urgentColor,
    glyphScale,
    glyphSpacing,
  );
}

function fitMenuGlyphScale(
  glyphScale,
  height,
  stroke = styleDefaults.menubarStroke,
) {
  let scale = glyphScale;
  const strokeWidth = normalizeStyleInteger(
    stroke,
    styleDefaults.menubarStroke,
    0,
    4,
  );
  const safetyMargin = 8 + strokeWidth * 2;

  while (scale > 2 && menuGlyphHeight() * scale > height - safetyMargin) {
    scale--;
  }

  return scale;
}

function menuGlyphSpacingForScale(glyphScale) {
  return Math.max(
    1,
    Math.round(
      (menuGlyphSpacing * glyphScale) / styleDefaults.menubarGlyphScale,
    ),
  );
}

function menuTextWidth(text, glyphScale, glyphSpacing) {
  let width = 0;

  for (const char of text) {
    const glyph = menuGlyphs[char];
    if (!glyph) {
      continue;
    }
    if (width > 0) {
      width += glyphSpacing;
    }
    width += glyph[0].length * glyphScale;
  }

  return width;
}

function menuGlyphHeight() {
  return menuGlyphs.J.length;
}

function drawMenuText(
  rgba,
  width,
  height,
  text,
  x,
  y,
  color,
  glyphScale,
  glyphSpacing,
) {
  let cursorX = x;

  for (const char of text) {
    const glyph = menuGlyphs[char];
    if (!glyph) {
      continue;
    }

    for (let row = 0; row < glyph.length; row++) {
      for (let col = 0; col < glyph[row].length; col++) {
        if (glyph[row][col] === "1") {
          fillRect(
            rgba,
            width,
            height,
            cursorX + col * glyphScale,
            y + row * glyphScale,
            glyphScale,
            glyphScale,
            color,
          );
        }
      }
    }

    cursorX += glyph[0].length * glyphScale + glyphSpacing;
  }
}

function drawMenuBarShapeStroke(
  rgba,
  width,
  height,
  x,
  y,
  boxWidth,
  boxHeight,
  color,
  stroke = styleDefaults.menubarStroke,
  shape = styleDefaults.menubarShape,
  radius = styleDefaults.menubarRadius,
) {
  const normalizedShape = normalizeMenubarShape(shape);
  const strokeWidth = normalizeStyleInteger(
    stroke,
    styleDefaults.menubarStroke,
    1,
    4,
  );
  let mask = shapeScanlineMask(normalizedShape, boxWidth, boxHeight, radius);
  const shapeHeight = shapeScanlineHeight(normalizedShape, boxHeight);

  for (let ring = 0; ring < strokeWidth; ring++) {
    const boundary = Buffer.alloc(mask.length, 0);

    for (let row = 0; row < shapeHeight; row++) {
      for (let column = 0; column < boxWidth; column++) {
        const offset = row * boxWidth + column;

        if (
          !mask[offset] ||
          !isMaskBoundary(mask, boxWidth, shapeHeight, column, row)
        ) {
          continue;
        }

        boundary[offset] = 1;
        setPixel(rgba, width, height, x + column, y + row, color);
      }
    }

    if (ring === strokeWidth - 1) {
      break;
    }

    for (let offset = 0; offset < mask.length; offset++) {
      if (boundary[offset]) {
        mask[offset] = 0;
      }
    }
  }

  if (normalizedShape === "ticket") {
    drawTicketPerforation(rgba, width, height, x, y, boxWidth, boxHeight, [
      color[0],
      color[1],
      color[2],
      Math.round((color[3] ?? 255) * 0.5),
    ]);
  }
}

function isMaskBoundary(mask, maskWidth, maskHeight, x, y) {
  const neighbors = [
    [x - 1, y],
    [x + 1, y],
    [x, y - 1],
    [x, y + 1],
  ];

  return neighbors.some(([neighborX, neighborY]) => {
    if (
      neighborX < 0 ||
      neighborY < 0 ||
      neighborX >= maskWidth ||
      neighborY >= maskHeight
    ) {
      return true;
    }

    return !mask[neighborY * maskWidth + neighborX];
  });
}

function drawMenuBarShapeFill(
  rgba,
  width,
  height,
  x,
  y,
  boxWidth,
  boxHeight,
  color,
  shape = styleDefaults.menubarShape,
  radius = styleDefaults.menubarRadius,
) {
  const normalizedShape = normalizeMenubarShape(shape);
  const shapeHeight = shapeScanlineHeight(normalizedShape, boxHeight);

  for (let row = 0; row < shapeHeight; row++) {
    const insets = shapeRowInsets(
      normalizedShape,
      row,
      boxWidth,
      boxHeight,
      radius,
    );

    if (!insets) {
      continue;
    }

    const start = insets.left;
    const end = boxWidth - 1 - insets.right;

    for (let column = start; column <= end; column++) {
      setPixel(rgba, width, height, x + column, y + row, color);
    }
  }

  if (normalizedShape === "ticket") {
    drawTicketPerforation(
      rgba,
      width,
      height,
      x,
      y,
      boxWidth,
      boxHeight,
      [0, 0, 0, 0],
    );
  }
}

function shapeScanlineMask(
  shape,
  boxWidth,
  boxHeight,
  radius = styleDefaults.menubarRadius,
) {
  const shapeHeight = shapeScanlineHeight(shape, boxHeight);
  const mask = Buffer.alloc(boxWidth * shapeHeight, 0);

  for (let row = 0; row < shapeHeight; row++) {
    const insets = shapeRowInsets(shape, row, boxWidth, boxHeight, radius);

    if (!insets) {
      continue;
    }

    const start = insets.left;
    const end = boxWidth - 1 - insets.right;

    for (let column = start; column <= end; column++) {
      mask[row * boxWidth + column] = 1;
    }
  }

  return mask;
}

function shapeScanlineHeight(shape, boxHeight) {
  return boxHeight + (shape === "bubble" ? menuBubbleTailHeight : 0);
}

function shapeRowInsets(
  shape,
  row,
  boxWidth,
  boxHeight,
  radius = styleDefaults.menubarRadius,
) {
  if (row < 0 || row >= shapeScanlineHeight(shape, boxHeight)) {
    return null;
  }

  if (shape === "bubble" && row >= boxHeight) {
    return bubbleTailRowInsets(row - boxHeight, boxWidth);
  }

  let inset;

  switch (shape) {
    case "pill":
      inset = pillRowInset(row, boxHeight);
      break;
    case "square":
      inset = 0;
      break;
    case "ticket":
      inset = ticketRowInset(row, boxHeight);
      break;
    case "bubble":
      inset = roundedRowInset(
        row,
        boxHeight,
        Math.max(4, normalizeMenubarRadius(radius)),
      );
      break;
    case "rounded":
    default:
      inset = roundedRowInset(row, boxHeight, normalizeMenubarRadius(radius));
      break;
  }

  const safeInset = Math.max(
    0,
    Math.min(Math.floor((boxWidth - 1) / 2), Math.round(inset)),
  );
  return { left: safeInset, right: safeInset };
}

function normalizeMenubarRadius(radius) {
  return normalizeStyleInteger(radius, styleDefaults.menubarRadius, 0, 10);
}

function roundedRowInset(row, boxHeight, radius) {
  if (radius <= 0) {
    return 0;
  }

  if (row < radius) {
    return radius - 1 - row;
  }

  if (row >= boxHeight - radius) {
    return radius - boxHeight + row;
  }

  return 0;
}

function pillRowInset(row, boxHeight) {
  const radius = Math.floor(boxHeight / 2);

  if (radius <= 0) {
    return 0;
  }

  const center = (boxHeight - 1) / 2;
  const dy = Math.min(radius - 0.5, Math.abs(row - center));
  return radius - Math.round(Math.sqrt(Math.max(0, radius ** 2 - dy ** 2)));
}

function ticketRowInset(row, boxHeight) {
  const cornerInset = roundedRowInset(row, boxHeight, 3);
  const notchRadius = Math.max(3, Math.floor(boxHeight / 6));
  const dy = Math.abs(row - (boxHeight - 1) / 2);

  if (dy > notchRadius) {
    return cornerInset;
  }

  const notchInset = Math.round(
    Math.sqrt(Math.max(0, notchRadius ** 2 - dy ** 2)),
  );
  return Math.max(cornerInset, notchInset);
}

function bubbleTailRowInsets(tailRow, boxWidth) {
  if (tailRow < 0 || tailRow >= menuBubbleTailHeight) {
    return null;
  }

  const baseLeft = Math.max(1, Math.round(boxWidth * 0.2) - 3);
  const baseRight = Math.min(boxWidth - 2, baseLeft + 5);
  const tip = Math.max(0, baseLeft - 2);
  const progress = tailRow / Math.max(1, menuBubbleTailHeight - 1);
  const left = Math.round(baseLeft + (tip - baseLeft) * progress);
  const rightEdge = Math.round(baseRight + (tip - baseRight) * progress);

  return {
    left,
    right: boxWidth - 1 - rightEdge,
  };
}

function drawTicketPerforation(
  rgba,
  width,
  height,
  x,
  y,
  boxWidth,
  boxHeight,
  color,
) {
  const perforationX = x + Math.round((boxWidth - 1) * 0.25);

  for (let row = 2; row < boxHeight - 2; row += 3) {
    setPixel(rgba, width, height, perforationX, y + row, color);
  }
}

function fillRect(rgba, width, height, x, y, boxWidth, boxHeight, color) {
  for (let py = y; py < y + boxHeight; py++) {
    for (let px = x; px < x + boxWidth; px++) {
      setPixel(rgba, width, height, px, py, color);
    }
  }
}

function setPixel(rgba, width, height, x, y, color) {
  if (x < 0 || y < 0 || x >= width || y >= height) {
    return;
  }

  const offset = (y * width + x) * 4;
  rgba[offset] = color[0];
  rgba[offset + 1] = color[1];
  rgba[offset + 2] = color[2];
  rgba[offset + 3] = color[3] ?? 255;
}

function encodePng(width, height, rgba, dpi) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride);
  }

  const chunks = [signature, pngChunk("IHDR", ihdr)];
  if (dpi) {
    chunks.push(pngChunk("pHYs", pngPhysChunk(dpi)));
  }
  chunks.push(
    pngChunk("IDAT", zlib.deflateSync(raw, { level: 9 })),
    pngChunk("IEND", Buffer.alloc(0)),
  );

  return Buffer.concat(chunks);
}

function pngPhysChunk(dpi) {
  const chunk = Buffer.alloc(9);
  const pixelsPerMeter = Math.round(dpi / 0.0254);
  chunk.writeUInt32BE(pixelsPerMeter, 0);
  chunk.writeUInt32BE(pixelsPerMeter, 4);
  chunk[8] = 1;
  return chunk;
}

function pngChunk(type, data) {
  const length = Buffer.alloc(4);
  const body = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(body), 0);

  return Buffer.concat([length, body, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;

  for (let i = 0; i < buffer.length; i++) {
    crc = pngCrcTable[(crc ^ buffer[i]) & 0xff] ^ (crc >>> 8);
  }

  return (crc ^ 0xffffffff) >>> 0;
}

function hexToRgba(hex) {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
    255,
  ];
}

// SwiftBar ANSI 파서는 24bit(38;2)를 무시하고 256색(38;5)만 지원 + 팔레트 공식이
// 비표준(String+ANSIColor.swift/NSColor.swift v2.0.1 실측)이라, 실제 렌더 팔레트를
// 그대로 재현해 목표색에 가장 가까운 인덱스를 고른다.
const swiftBarAnsi256Palette = (() => {
  const clamp255 = (value) => Math.max(0, Math.min(1, value)) * 255;
  const palette = [];

  for (let index = 16; index < 256; index++) {
    let r;
    let g;
    let b;

    if (index < 232) {
      const i = index - 16;
      r = i / 36 > 1 ? ((i / 36) * 40 + 55) / 255 : 0;
      g = (i % 36) / 6 > 1 ? (((i % 36) / 6) * 40 + 55) / 255 : 0;
      b = i % 6 > 1 ? ((i % 36) * 40 + 55) / 255 : 0;
    } else {
      const i = index - 232;
      r = (i * 10 + 8) / 255;
      g = r;
      b = r;
    }

    palette.push([clamp255(r), clamp255(g), clamp255(b), index]);
  }

  return palette;
})();

function hexToAnsi256(hex) {
  const [r, g, b] = hexToRgba(hex);
  let bestIndex = 231;
  let bestDistance = Infinity;

  for (const [pr, pg, pb, index] of swiftBarAnsi256Palette) {
    const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }

  return bestIndex;
}

function paint(text, hex, style) {
  if (!style.ansi || !hex) {
    return text;
  }

  return `\x1b[38;5;${hexToAnsi256(hex)}m${text}\x1b[0m`;
}

function lineWithParams(text, params) {
  const renderedParams = params.filter(Boolean).join(" ");
  return renderedParams ? `${text} | ${renderedParams}` : text;
}

function sizeParam(size) {
  return `size=${size}`;
}

function colorParam(hex) {
  return hex ? `color=${hex}` : "";
}

function renderNormal(config, sectionResults, options = {}) {
  const style = getStyle(config);
  const sectionMap = new Map(
    sectionResults.map((result) => [result.section.id, result]),
  );
  const urgentResult = sectionMap.get("urgent");
  const urgentCount = urgentResult?.ok ? resultIssueCount(urgentResult) : 0;
  const totalMine = countUniqueMine(sectionMap);

  const menuTitle = {
    base: `J${totalMine}`,
    urgentSuffix: urgentCount >= 1 ? `·${urgentCount}!` : "",
  };

  const chunks = [];
  for (const result of sectionResults) {
    const chunk = renderSection(config, result, options);
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
  }

  const dropdown = chunks.flatMap((chunk, index) => {
    if (index === 0) {
      return chunk;
    }
    return ["---", ...chunk];
  });

  if (dropdown.length > 0) {
    dropdown.push("---");
  }

  dropdown.push(...renderFooter(config, options.doneStats));

  const menuBarLines = [renderMenuBarLine(menuTitle, style)];
  if (style.menubarRotate && urgentCount >= 1) {
    menuBarLines.push(
      lineWithParams(`🔥 ${urgentCount}건 즉시 처리`, [
        sizeParam(style.sizes.menubar),
        colorParam(style.colors.urgent),
      ]),
    );
  }

  return [...menuBarLines, "---", ...dropdown].join("\n");
}

function renderSection(config, result, options = {}) {
  const style = getStyle(config);
  const { section } = result;

  if (!result.ok) {
    if (section.stale) {
      return [];
    }
    return [
      lineWithParams(section.title, [
        sizeParam(style.sizes.header),
        colorParam(style.colors.header),
      ]),
      lineWithParams(`⚠ 조회 실패: ${escapeText(shortMessage(result.error))}`, [
        colorParam(style.colors.error),
      ]),
    ];
  }

  const issueCount = resultIssueCount(result);

  if (issueCount === 0) {
    if (section.id === "urgent") {
      return [
        lineWithParams(`${section.title} (0) — 깨끗함 ✨`, [
          sizeParam(style.sizes.header),
          colorParam(style.colors.header),
        ]),
      ];
    }
    return [];
  }

  const lines = [
    lineWithParams(`${section.title} (${issueCount})`, [
      sizeParam(style.sizes.header),
      colorParam(style.colors.header),
    ]),
  ];

  if (section.id === "planned" && style.groupByParent) {
    lines.push(...renderParentGroupedIssues(config, section, result.issues));
  } else {
    for (const issue of result.issues) {
      lines.push(
        renderIssue(config, section, issue, {
          commentMarker:
            section.id === "movedByOthers" &&
            options.newCommentKeys?.has(issue.key),
          annotation: section.stale
            ? ` (${staleIssueAgeDays(issue, options.now)}일 전)`
            : "",
        }),
      );

      if (mineSectionIds.has(section.id)) {
        lines.push(...renderMineIssueTransitionChildren(config, issue));
      }

      if (section.id === "movedByOthers") {
        lines.push(...renderMovedIssueChildren(config, issue));
      }
    }
  }

  if (result.overflowCount > 0) {
    lines.push(
      lineWithParams(`외 ${result.overflowCount}건`, [
        sizeParam(style.sizes.footer),
        colorParam(style.colors.dim),
      ]),
    );
  }

  if (section.id === "movedByOthers") {
    const scriptPath = path.resolve(process.argv[1] || __filename);
    lines.push(
      lineWithParams("모두 확인함", [
        `bash=${scriptPath}`,
        "param1=seen-all",
        "terminal=false",
        "refresh=true",
        sizeParam(style.sizes.footer),
        colorParam(style.colors.dim),
      ]),
    );
  }

  return lines;
}

function renderMineIssueTransitionChildren(config, issue) {
  const style = getStyle(config);
  const scriptPath = path.resolve(process.argv[1] || __filename);
  const key = issue.key || "";
  const currentStatusName = issue.fields?.status?.name || "";
  const lines = [
    lineWithParams("-- 티켓 열기", [
      `href=${issueBrowseUrl(config, key)}`,
      sizeParam(style.sizes.footer),
      colorParam(style.colors.dim),
    ]),
  ];

  for (const target of config.transitionTargets) {
    if (target.status === currentStatusName) {
      continue;
    }

    lines.push(
      lineWithParams(`-- ${target.label}`, [
        sizeParam(style.sizes.footer),
        colorParam(style.colors.dim),
      ]),
      lineWithParams("---- 확인 — 전이 실행", [
        `bash=${scriptPath}`,
        "param1=transition",
        `param2=${key}`,
        `param3=${target.status}`,
        "terminal=false",
        "refresh=true",
      ]),
    );
  }

  return lines;
}

function renderMovedIssueChildren(config, issue) {
  const style = getStyle(config);
  const scriptPath = path.resolve(process.argv[1] || __filename);
  const key = issue.key || "";
  const updatedIso = issue.fields?.updated || "";

  return [
    lineWithParams("-- 티켓 열기", [
      `href=${issueBrowseUrl(config, key)}`,
      sizeParam(style.sizes.footer),
      colorParam(style.colors.dim),
    ]),
    lineWithParams("-- ✅ 확인함", [
      `bash=${scriptPath}`,
      "param1=seen",
      `param2=${key}`,
      `param3=${updatedIso}`,
      "terminal=false",
      "refresh=true",
    ]),
  ];
}

function renderParentGroupedIssues(config, section, issues) {
  const style = getStyle(config);
  const groups = new Map();

  for (const issue of issues) {
    const parent = issue.fields?.parent;
    const parentKey = parent?.key || "";
    const groupId = parentKey || "__other__";

    if (!groups.has(groupId)) {
      groups.set(groupId, {
        parentKey,
        parentSummary: parent?.fields?.summary || parent?.summary || "",
        issues: [],
      });
    }

    groups.get(groupId).issues.push(issue);
  }

  const lines = [];
  for (const group of groups.values()) {
    const title = group.parentKey
      ? `— ${escapeText(group.parentKey)} ${truncateText(group.parentSummary || "제목 없음", 30)}`
      : "— 기타";
    lines.push(
      lineWithParams(title, [
        sizeParam(style.sizes.footer),
        colorParam(style.colors.dim),
      ]),
    );

    for (const issue of group.issues) {
      lines.push(renderIssue(config, section, issue));
      lines.push(...renderMineIssueTransitionChildren(config, issue));
    }
  }

  return lines;
}

function renderIssue(config, section, issue, options = {}) {
  const style = getStyle(config);
  const fields = issue.fields || {};
  const key = escapeText(issue.key || "");
  const status = escapeText(fields.status?.name || "상태 없음");
  const summary = truncateText(
    fields.summary || "제목 없음",
    style.summaryLength,
  );
  const priority = fields.priority?.name || "";
  const assignee = escapeText(fields.assignee?.displayName || "미할당");
  const browseUrl = issueBrowseUrl(config, issue.key || "");
  const dueBadge = renderDueBadge(section, fields.duedate, style);
  const keyWithBadge = dueBadge ? `${key} ${dueBadge}` : key;
  const marker =
    style.priorityMarker &&
    section.priorityMarker &&
    (priority === "High" || priority === "Highest")
      ? "‼️ "
      : "";

  let label;
  if (style.ansi) {
    label = section.showStatus
      ? [
          paint(key, style.colors.key, style),
          dueBadge ? ` ${dueBadge}` : "",
          " ",
          paint(status, style.colors.status, style),
          " ",
          paint(`· ${summary}`, style.colors.summary, style),
        ].join("")
      : [
          paint(key, style.colors.key, style),
          dueBadge ? ` ${dueBadge}` : "",
          " ",
          paint(summary, style.colors.summary, style),
        ].join("");
  } else {
    label = section.showStatus
      ? `${keyWithBadge} ${status} · ${summary}`
      : `${keyWithBadge} ${summary}`;
  }

  if (section.showAssignee) {
    label = style.ansi
      ? `${label}${paint(` — ${assignee}`, style.colors.assignee, style)}`
      : `${label} — ${assignee}`;
  }

  if (options.annotation) {
    const annotation = escapeText(options.annotation);
    label = style.ansi
      ? `${label} ${paint(annotation, style.colors.dim, style)}`
      : `${label} ${annotation}`;
  }

  const params = [`href=${browseUrl}`, sizeParam(style.sizes.item)];
  if (style.itemFont) {
    params.push(`font=${style.itemFont}`);
  }
  if (style.ansi) {
    params.push("ansi=true");
  }

  return lineWithParams(
    `${options.commentMarker ? "💬 " : ""}${marker}${label}`,
    params,
  );
}

function staleIssueAgeDays(issue, now = new Date()) {
  const updated = issueUpdatedTime(issue);
  if (!updated) {
    return 0;
  }

  return Math.max(0, Math.floor((now.getTime() - updated) / 86400000));
}

function issueBrowseUrl(config, key) {
  return `${config.baseUrl}/browse/${encodeURIComponent(key)}`;
}

function renderDueBadge(section, duedate, style) {
  if (!section.showDueBadge || !duedate) {
    return "";
  }

  const days = dueDateDiffDays(duedate);

  if (!Number.isFinite(days)) {
    return "";
  }

  const text =
    days === 0 ? "[D-DAY]" : days > 0 ? `[D-${days}]` : `[D+${Math.abs(days)}]`;
  const color = days <= 3 ? style.colors.urgent : style.colors.dim;

  return style.ansi ? paint(text, color, style) : text;
}

function dueDateDiffDays(duedate) {
  const dueTime = localDateOnlyTime(duedate);

  if (!Number.isFinite(dueTime)) {
    return NaN;
  }

  const now = new Date();
  const todayTime = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();

  return Math.round((dueTime - todayTime) / (24 * 60 * 60 * 1000));
}

function countUniqueMine(sectionMap) {
  const mineTotalCount = sectionMap.get("urgent")?.mineTotalCount;
  if (Number.isFinite(mineTotalCount)) {
    return mineTotalCount;
  }

  const keys = new Set();

  for (const id of ["urgent", "inProgress", "planned", "otherMine"]) {
    const result = sectionMap.get(id);
    if (!result?.ok) {
      continue;
    }

    for (const issue of result.issues) {
      if (issue.key) {
        keys.add(issue.key);
      }
    }
  }

  return keys.size;
}

function countUniqueIssues(issues) {
  const keys = new Set();

  for (const issue of issues) {
    if (issue.key) {
      keys.add(issue.key);
    }
  }

  return keys.size;
}

function resultIssueCount(result) {
  return Number.isFinite(result.totalCount)
    ? result.totalCount
    : result.issues.length;
}

function renderFooter(config, doneStats) {
  const style = getStyle(config);

  return [
    `🌐 Jira 열기 | href=${config.baseUrl}/jira/your-work`,
    "🔄 새로고침 | refresh=true",
    ...renderSettingsMenu(config),
    ...(doneStats?.available
      ? [
          lineWithParams(
            `오늘 완료 ${doneStats.doneToday} · 주간 ${doneStats.doneWeek}`,
            [sizeParam(style.sizes.footer), colorParam(style.colors.dim)],
          ),
        ]
      : []),
    lineWithParams(`측정 ${formatTime(new Date())} · ${version}`, [
      sizeParam(style.sizes.footer),
      colorParam(style.colors.dim),
    ]),
  ];
}

function renderSettingsMenu(config) {
  const style = getStyle(config);
  const rows = [
    lineWithParams("⚙️ 위젯 설정", [
      sizeParam(style.sizes.footer),
      colorParam(style.colors.dim),
    ]),
  ];
  const settingsStyleParams = [
    sizeParam(style.sizes.footer),
    colorParam(style.colors.dim),
  ];
  const scriptPath = path.resolve(process.argv[1] || __filename);
  const pushSetting = (prefix, label, active, dottedPath, value) => {
    rows.push(
      lineWithParams(`${prefix} ${active ? "✓ " : ""}${label}`, [
        `bash=${scriptPath}`,
        "param1=set",
        `param2=${dottedPath}`,
        `param3=${value}`,
        "terminal=false",
        "refresh=true",
        ...settingsStyleParams,
      ]),
    );
  };
  const pushGroup = (label) => {
    rows.push(lineWithParams(`-- ${label}`, settingsStyleParams));
  };

  pushSetting(
    "--",
    "메뉴바 outline: 켜기",
    style.outline === true,
    "style.outline",
    "true",
  );
  pushSetting(
    "--",
    "메뉴바 outline: 끄기",
    style.outline === false,
    "style.outline",
    "false",
  );
  pushSetting(
    "--",
    "메뉴바 채움: 켜기",
    style.menubarFilled === true,
    "style.menubarFilled",
    "true",
  );
  pushSetting(
    "--",
    "메뉴바 채움: 끄기",
    style.menubarFilled === false,
    "style.menubarFilled",
    "false",
  );
  pushColorSettings("메뉴바 색", "style.colors.menubar", style.colors.menubar, [
    ["", "시스템 기본 (기본)"],
    ["#ffffff", "흰색"],
    ["#8b949e", "회색"],
    ["#58a6ff", "파랑"],
    ["#56d364", "초록"],
    ["#d29922", "주황"],
  ]);
  pushColorSettings(
    "메뉴바 긴급 색",
    "style.colors.urgent",
    style.colors.urgent,
    [
      ["#e5534b", "빨강 (기본)"],
      ["#f0883e", "주황"],
      ["#e3b341", "노랑"],
      ["#ff7b72", "분홍"],
      ["#bc8cff", "보라"],
    ],
  );
  pushSizeSettings(
    "메뉴바 글자 크기",
    "style.menubarGlyphScale",
    style.menubarGlyphScale,
    [
      [2, "작게"],
      [3, "보통 (기본)"],
      [4, "크게"],
      [5, "아주 크게"],
    ],
  );
  pushSizeSettings(
    "메뉴바 아이콘 크기",
    "style.menubarHeight",
    style.menubarHeight,
    [
      [28, "작게"],
      [32, "보통 (기본)"],
      [36, "크게"],
      [40, "아주 크게"],
    ],
  );
  pushSizeSettings(
    "메뉴바 텍스트 크기 (outline 끔)",
    "style.sizes.menubar",
    style.sizes.menubar,
    [
      [10, "10"],
      [12, "12 (기본)"],
      [14, "14"],
      [16, "16"],
    ],
  );
  pushSizeSettings(
    "아웃라인 두께",
    "style.menubarStroke",
    style.menubarStroke,
    [
      [1, "1px (기본)"],
      [2, "2px"],
      [3, "3px"],
      [4, "4px"],
    ],
  );
  pushSizeSettings(
    "박스 좌우 여백",
    "style.menubarPadding",
    style.menubarPadding,
    [
      [8, "좁게"],
      [16, "보통 (기본)"],
      [24, "넓게"],
      [32, "아주 넓게"],
    ],
  );
  pushSizeSettings(
    "박스 상하 여백",
    "style.menubarPaddingV",
    style.menubarPaddingV,
    [
      [0, "없음"],
      [2, "좁게"],
      [4, "보통 (기본)"],
      [8, "넓게"],
      [12, "아주 넓게"],
    ],
  );
  pushSizeSettings("박스 모서리", "style.menubarRadius", style.menubarRadius, [
    [0, "직각"],
    [2, "살짝"],
    [4, "보통 (기본)"],
    [8, "둥글게"],
  ]);
  pushDefaultableSettings(
    "박스 모양",
    "style.menubarShape",
    style.menubarShape,
    [
      ["rounded", "라운드 (기본)"],
      ["pill", "알약"],
      ["square", "직각"],
      ["ticket", "🎫 티켓"],
      ["bubble", "💬 말풍선"],
    ],
  );
  pushSetting(
    "--",
    "영역별 색상: 켜기",
    style.ansi === true,
    "style.ansi",
    "true",
  );
  pushSetting(
    "--",
    "영역별 색상: 끄기",
    style.ansi === false,
    "style.ansi",
    "false",
  );
  pushSetting(
    "--",
    "우선순위 마커: 켜기",
    style.priorityMarker === true,
    "style.priorityMarker",
    "true",
  );
  pushSetting(
    "--",
    "우선순위 마커: 끄기",
    style.priorityMarker === false,
    "style.priorityMarker",
    "false",
  );
  pushSetting(
    "--",
    "부모별 그룹핑: 켜기",
    style.groupByParent === true,
    "style.groupByParent",
    "true",
  );
  pushSetting(
    "--",
    "부모별 그룹핑: 끄기",
    style.groupByParent === false,
    "style.groupByParent",
    "false",
  );

  pushSizeSettings("항목 글자 크기", "style.sizes.item", style.sizes.item, [
    [11, "11"],
    [12, "12"],
    [13, "13 (기본)"],
    [14, "14"],
    [15, "15"],
  ]);
  pushDefaultableSettings("항목 글꼴", "style.itemFont", style.itemFont, [
    ["", "시스템 (기본)"],
    ["Menlo", "Menlo"],
    ["SFMono-Regular", "SF Mono"],
  ]);
  pushSizeSettings("헤더 글자 크기", "style.sizes.header", style.sizes.header, [
    [10, "10"],
    [11, "11 (기본)"],
    [12, "12"],
    [13, "13"],
  ]);
  pushColorSettings("key 색", "style.colors.key", style.colors.key, [
    ["#79c0ff", "파랑 (기본)"],
    ["#39c5cf", "청록"],
    ["#bc8cff", "보라"],
    ["#56d364", "초록"],
    ["", "시스템 기본"],
  ]);
  pushColorSettings("상태 색", "style.colors.status", style.colors.status, [
    ["#d29922", "주황 (기본)"],
    ["#e3b341", "노랑"],
    ["#ff7b72", "분홍"],
    ["#8b949e", "회색"],
    ["", "시스템 기본"],
  ]);
  pushColorSettings("헤더 색", "style.colors.header", style.colors.header, [
    ["#8b949e", "회색 (기본)"],
    ["#58a6ff", "파랑"],
    ["#d29922", "주황"],
    ["#bc8cff", "보라"],
    ["", "시스템 기본"],
  ]);
  pushColorSettings("요약 색", "style.colors.summary", style.colors.summary, [
    ["", "시스템 기본 (기본)"],
    ["#8b949e", "회색"],
    ["#c9d1d9", "밝은 회색"],
  ]);
  pushColorSettings(
    "담당자 색",
    "style.colors.assignee",
    style.colors.assignee,
    [
      ["#8b949e", "회색 (기본)"],
      ["#79c0ff", "파랑"],
      ["#56d364", "초록"],
      ["", "시스템 기본"],
    ],
  );
  pushSizeSettings("요약 길이", "style.summaryLength", style.summaryLength, [
    [30, "짧게 (30자)"],
    [46, "보통 (46자, 기본)"],
    [60, "길게 (60자)"],
    [80, "아주 길게 (80자)"],
  ]);
  pushSetting(
    "--",
    "알림: 켜기",
    config.notifications === true,
    "notifications",
    "true",
  );
  pushSetting(
    "--",
    "알림: 끄기",
    config.notifications === false,
    "notifications",
    "false",
  );
  pushSetting(
    "--",
    "아침 브리핑: 켜기",
    config.briefing === true,
    "briefing",
    "true",
  );
  pushSetting(
    "--",
    "아침 브리핑: 끄기",
    config.briefing === false,
    "briefing",
    "false",
  );
  pushSetting(
    "--",
    "메뉴바 순환: 켜기",
    style.menubarRotate === true,
    "style.menubarRotate",
    "true",
  );
  pushSetting(
    "--",
    "메뉴바 순환: 끄기",
    style.menubarRotate === false,
    "style.menubarRotate",
    "false",
  );
  pushSizeSettings("새 티켓 기간", "newTicketDays", config.newTicketDays, [
    [1, "1일"],
    [3, "3일 (기본)"],
    [7, "7일"],
  ]);
  rows.push(
    lineWithParams("-- 🕸 스테일 리포트 지금 실행", [
      `bash=${scriptPath}`,
      "param1=stale-report",
      "terminal=false",
      "refresh=true",
      ...settingsStyleParams,
    ]),
    lineWithParams("-- 📋 브리핑 지금 보기", [
      `bash=${scriptPath}`,
      "param1=briefing",
      "terminal=false",
      ...settingsStyleParams,
    ]),
  );
  rows.push(
    lineWithParams("-- 📝 config 파일 열기", [
      "bash=/usr/bin/open",
      `param1=${getConfigPath()}`,
      "terminal=false",
      ...settingsStyleParams,
    ]),
  );

  return rows;

  function pushSizeSettings(label, dottedPath, currentValue, options) {
    pushGroup(label);
    for (const [value, optionLabel] of options) {
      pushSetting(
        "----",
        optionLabel,
        currentValue === value,
        dottedPath,
        value,
      );
    }
  }

  function pushColorSettings(label, dottedPath, currentValue, options) {
    pushDefaultableSettings(label, dottedPath, currentValue, options);
  }

  function pushDefaultableSettings(label, dottedPath, currentValue, options) {
    pushGroup(label);
    for (const [value, optionLabel] of options) {
      pushSetting(
        "----",
        optionLabel,
        currentValue === value,
        dottedPath,
        value || "default",
      );
    }
  }
}

function renderAllFailed(config, sectionResults) {
  const style = getStyle(config);
  const firstError = sectionResults.find((result) => !result.ok)?.error;
  const lines = [
    lineWithParams("J!", [
      colorParam(style.colors.error),
      sizeParam(style.sizes.menubar),
      "font=Menlo",
    ]),
    "---",
    lineWithParams(
      `⚠ 모든 Jira 조회 실패: ${escapeText(shortMessage(firstError || "알 수 없는 오류"))}`,
      [colorParam(style.colors.error)],
    ),
  ];

  const cached = readCache();
  if (cached?.body) {
    lines.push(
      lineWithParams(`⚠ ${cached.ageMinutes}분 전 캐시`, [
        sizeParam(style.sizes.footer),
        colorParam(style.colors.error),
      ]),
      "---",
      ...cachedBodyWithFreshFooter(cached.body, config),
    );
  } else {
    lines.push(
      lineWithParams("캐시 없음", [
        sizeParam(style.sizes.footer),
        colorParam(style.colors.dim),
      ]),
      "---",
      ...renderFooter(config),
    );
  }

  return lines.join("\n");
}

function cachedBodyWithFreshFooter(body, config) {
  const cachedLines = String(body || "").split("\n");
  const footerIndex = cachedLines.findIndex((line) =>
    line.startsWith("🌐 Jira 열기 |"),
  );
  const bodyLines =
    footerIndex === -1 ? cachedLines : cachedLines.slice(0, footerIndex);
  const lines = bodyLines.filter(
    (line, index) => line || index < bodyLines.length - 1,
  );

  if (lines.length > 0 && lines[lines.length - 1] !== "---") {
    lines.push("---");
  }

  lines.push(...renderFooter(config));
  return lines;
}

function readCache() {
  let output;
  try {
    output = fs.readFileSync(getCacheOutputPath(), "utf8").trim();
  } catch {
    return null;
  }

  const marker = "\n---\n";
  const markerIndex = output.indexOf(marker);
  if (markerIndex === -1) {
    return null;
  }

  let timestamp = 0;
  try {
    timestamp = Number(fs.readFileSync(getCacheTimestampPath(), "utf8").trim());
  } catch {}

  const ageMinutes =
    timestamp > 0
      ? Math.max(0, Math.floor((Date.now() - timestamp) / 60000))
      : "?";
  return {
    ageMinutes,
    body: output.slice(markerIndex + marker.length),
  };
}

function writeCache(output) {
  try {
    fs.mkdirSync(getCacheDir(), { recursive: true });
    fs.writeFileSync(getCacheOutputPath(), `${output}\n`, "utf8");
    fs.writeFileSync(getCacheTimestampPath(), String(Date.now()), "utf8");
  } catch {}
}

function updateNotificationState(config, sectionResults, control = {}) {
  try {
    const previous = control.previousNotifyState || readNotifyState();
    const now = control.now instanceof Date ? control.now : new Date();
    const snapshot = buildNotifySnapshot(
      sectionResults,
      control.commentDetection,
    );

    snapshot.comments =
      control.commentDetection?.comments || previous.state.comments;
    snapshot.lastStaleReport = previous.state.lastStaleReport;
    snapshot.lastBriefingDate = previous.state.lastBriefingDate;

    if (config.notifications) {
      sendIssueNotifications(previous, snapshot);

      const staleIssues = control.staleResult?.ok
        ? control.staleResult.issues
        : [];
      if (
        staleIssues.length > 0 &&
        now.getTime() - snapshot.lastStaleReport > 6.5 * 24 * 60 * 60 * 1000
      ) {
        const notification = staleReportNotification(staleIssues);
        sendNotification(notification.title, notification.body);
        snapshot.lastStaleReport = now.getTime();
      }

      if (config.briefing && shouldSendBriefing(now, previous.state, config)) {
        const notification = briefingNotification(
          sectionResults,
          control.doneStats,
        );
        sendNotification(notification.title, notification.body);
        snapshot.lastBriefingDate = localDateString(now);
      }
    }

    writeNotifyState(snapshot);
  } catch {}
}

function readNotifyState() {
  try {
    const parsed = JSON.parse(fs.readFileSync(getNotifyStatePath(), "utf8"));

    if (!isPlainObject(parsed)) {
      return { exists: false, state: emptyNotifyState() };
    }

    return {
      exists: true,
      state: {
        urgentKeys: Array.isArray(parsed.urgentKeys)
          ? parsed.urgentKeys.map(String)
          : [],
        moved: isPlainObject(parsed.moved) ? parsed.moved : {},
        comments: isPlainObject(parsed.comments) ? parsed.comments : {},
        lastStaleReport: Number(parsed.lastStaleReport) || 0,
        lastBriefingDate:
          typeof parsed.lastBriefingDate === "string"
            ? parsed.lastBriefingDate
            : "",
        ts: Number(parsed.ts) || 0,
      },
    };
  } catch {
    return { exists: false, state: emptyNotifyState() };
  }
}

function emptyNotifyState() {
  return {
    urgentKeys: [],
    moved: {},
    comments: {},
    lastStaleReport: 0,
    lastBriefingDate: "",
    ts: 0,
  };
}

function buildNotifySnapshot(sectionResults, commentDetection) {
  const sectionMap = new Map(
    sectionResults.map((result) => [result.section.id, result]),
  );
  const urgentResult = sectionMap.get("urgent");
  const movedResult = sectionMap.get("movedByOthers");
  const urgentIssues = urgentResult?.ok ? urgentResult.issues : [];
  const movedIssues = movedResult?.ok ? movedResult.issues : [];

  return {
    urgentKeys: urgentIssues.map((issue) => issue.key).filter(Boolean),
    urgentIssues,
    moved: Object.fromEntries(
      movedIssues
        .map((issue) => [issue.key, issue.fields?.updated || ""])
        .filter(([key, updatedIso]) => key && updatedIso),
    ),
    movedIssues,
    comments: commentDetection?.comments || {},
    commentNotifications: commentDetection?.notifications || [],
    ts: Date.now(),
  };
}

function writeNotifyState(snapshot) {
  writeJsonObject(getNotifyStatePath(), {
    urgentKeys: snapshot.urgentKeys,
    moved: snapshot.moved,
    comments: snapshot.comments,
    lastStaleReport: snapshot.lastStaleReport,
    lastBriefingDate: snapshot.lastBriefingDate,
    ts: snapshot.ts,
  });
}

function sendIssueNotifications(previous, snapshot) {
  const previousState = previous.state;
  const previousUrgentKeys = new Set(previousState.urgentKeys || []);
  const previousMoved = isPlainObject(previousState.moved)
    ? previousState.moved
    : {};
  const newUrgent = previous.exists
    ? snapshot.urgentIssues
        .filter((issue) => issue.key && !previousUrgentKeys.has(issue.key))
        .map((issue) => ({
          key: issue.key,
          title: `🔥 즉시 처리: ${issue.key}`,
          body: notificationSummary(issue),
        }))
    : [];
  const newMoved = previous.exists
    ? snapshot.movedIssues
        .filter((issue) => {
          const key = issue.key || "";
          const updatedIso = issue.fields?.updated || "";
          const previousIso = previousMoved[key];

          return (
            key &&
            updatedIso &&
            (!previousIso || compareIsoTimes(updatedIso, previousIso) > 0)
          );
        })
        .map((issue) => ({
          key: issue.key,
          title: `🔔 티켓 업데이트: ${issue.key}`,
          body: notificationSummary(issue),
        }))
    : [];
  const notifications = [
    ...newUrgent,
    ...newMoved,
    ...(snapshot.commentNotifications || []),
  ];

  if (notifications.length === 0) {
    return;
  }

  if (notifications.length <= 3) {
    for (const notification of notifications) {
      sendNotification(notification.title, notification.body);
    }
    return;
  }

  sendNotification(
    `Jira 새 소식 ${notifications.length}건`,
    `${notifications
      .slice(0, 3)
      .map((notification) => notification.key)
      .join(", ")} …`,
  );
}

function computeDoneStats(doneResult, now = new Date()) {
  if (!doneResult?.ok) {
    return { available: false };
  }

  const midnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
  ).getTime();
  const issues = doneResult.issues || [];

  return {
    available: true,
    doneToday: issues.filter((issue) => issueUpdatedTime(issue) >= midnight)
      .length,
    doneWeek: issues.length,
  };
}

function staleReportNotification(issues) {
  const keys = issues
    .slice(0, 4)
    .map((issue) => issue.key)
    .filter(Boolean)
    .join(", ");

  return {
    title: `🕸 스테일 티켓 ${issues.length}건`,
    body: `${keys} — 드롭다운 스테일 섹션 참조`,
  };
}

function localDateString(date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(
    date.getDate(),
  )}`;
}

function shouldSendBriefing(now, state, config) {
  if (!config?.briefing) {
    return false;
  }

  const day = now.getDay();
  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = localDateString(now);

  return (
    day >= 1 &&
    day <= 5 &&
    minutes >= 8 * 60 + 30 &&
    minutes <= 12 * 60 &&
    state?.lastBriefingDate !== today
  );
}

function briefingNotification(sectionResults, doneStats) {
  const sectionMap = new Map(
    sectionResults.map((result) => [result.section.id, result]),
  );
  const count = (id) => {
    const result = sectionMap.get(id);
    return result?.ok ? resultIssueCount(result) : 0;
  };
  const parts = [
    `즉시 ${count("urgent")}`,
    `진행 ${count("inProgress")}`,
    `계획 ${count("planned")}`,
    `🔔 ${count("movedByOthers")}`,
  ];

  if (doneStats?.available) {
    parts.push(`완료(주) ${doneStats.doneWeek}`);
  }

  return {
    title: "📋 오늘의 Jira",
    body: parts.join(" · "),
  };
}

function notificationSummary(issue) {
  return truncateNotificationText(issue.fields?.summary || "제목 없음", 60);
}

function truncateNotificationText(value, maxLength) {
  const text = String(value || "")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const chars = Array.from(text);

  if (chars.length <= maxLength) {
    return text;
  }

  return `${chars.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function sendNotification(title, body) {
  try {
    const dryRunPath = process.env.JIRA_MENUBAR_NOTIFY_DRYRUN;

    if (dryRunPath) {
      fs.mkdirSync(path.dirname(dryRunPath), { recursive: true });
      fs.appendFileSync(dryRunPath, `${title}\t${body}\n`, "utf8");
      return;
    }

    execFileSync("/usr/bin/osascript", [
      "-e",
      buildNotificationScript(title, body),
    ]);
  } catch {}
}

function buildNotificationScript(title, body) {
  return `display notification ${appleScriptQuote(body)} with title ${appleScriptQuote(title)}`;
}

function appleScriptQuote(value) {
  return `"${String(value || "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')}"`;
}

function truncateText(value, maxLength) {
  const text = escapeText(value).replace(/\s+/g, " ").trim();
  const chars = Array.from(text);

  if (chars.length <= maxLength) {
    return text;
  }

  return `${chars.slice(0, Math.max(0, maxLength - 1)).join("")}…`;
}

function escapeText(value) {
  return String(value || "")
    .replace(/\|/g, " ")
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function shortMessage(error) {
  return escapeText(error?.message || error || "알 수 없는 오류").slice(0, 120);
}

function formatTime(date) {
  return `${pad2(date.getHours())}:${pad2(date.getMinutes())}`;
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

async function main() {
  const configResult = readConfig();
  if (configResult.setup) {
    process.stdout.write(`${renderSetupState(configResult.message)}\n`);
    return;
  }

  const { config } = configResult;
  const seen = readSeenStore();
  const sections = buildSectionDefs(config);
  const queries = buildQueryDefs(sections);
  const queryResults = await fetchQueryResults(config, queries);
  const sectionResults = buildSectionResults(
    sections,
    queryResults,
    seen,
    config.statusBuckets,
  );
  const allFailed = queryResults
    .filter(
      (result) =>
        result.query.id !== "stale" && result.query.id !== "doneRecent",
    )
    .every((result) => !result.ok);
  const now = new Date();
  const previousNotifyState = allFailed ? null : readNotifyState();
  const commentDetection = allFailed
    ? null
    : await detectRecentComments(
        config,
        sectionResults,
        previousNotifyState.state.comments,
        now,
      );
  const doneStats = computeDoneStats(
    queryResults.find((result) => result.query.id === "doneRecent"),
    now,
  );
  const output = allFailed
    ? renderAllFailed(config, sectionResults)
    : renderNormal(config, sectionResults, {
        doneStats,
        newCommentKeys: commentDetection.newCommentKeys,
        now,
      });

  if (!allFailed) {
    updateNotificationState(config, sectionResults, {
      previousNotifyState,
      commentDetection,
      staleResult: queryResults.find((result) => result.query.id === "stale"),
      doneStats,
      now,
    });
    writeCache(output);
  }

  process.stdout.write(`${output}\n`);
}

async function fetchQueryResults(config, queries) {
  const settled = await Promise.allSettled(
    queries.map((query) => fetchQuery(config, query)),
  );

  return settled.map((result, index) => {
    const query = queries[index];

    if (result.status === "fulfilled") {
      return {
        ok: true,
        query,
        issues: result.value.issues,
      };
    }

    return {
      ok: false,
      query,
      error: result.reason,
    };
  });
}

async function runStaleReport() {
  const configResult = readConfig();
  if (configResult.setup) {
    return 1;
  }

  try {
    const { config } = configResult;
    const sections = buildSectionDefs(config);
    const staleQuery = buildQueryDefs(sections).find(
      (query) => query.id === "stale",
    );
    const { issues } = await fetchQuery(config, staleQuery);
    const notification = staleReportNotification(issues);
    sendNotification(notification.title, notification.body);

    const state = readNotifyState().state;
    state.lastStaleReport = Date.now();
    state.ts = Date.now();
    writeNotifyState(state);
    return 0;
  } catch (error) {
    sendNotification("⚠ 스테일 리포트 실패", shortMessage(error));
    return 0;
  }
}

async function runBriefing() {
  const configResult = readConfig();
  if (configResult.setup) {
    return 1;
  }

  try {
    const { config } = configResult;
    const sections = buildSectionDefs(config);
    const queries = buildQueryDefs(sections).filter((query) =>
      ["mine", "movedByOthers", "doneRecent"].includes(query.id),
    );
    const queryResults = await fetchQueryResults(config, queries);
    const sectionResults = buildSectionResults(
      sections,
      queryResults,
      readSeenStore(),
      config.statusBuckets,
    );
    const doneStats = computeDoneStats(
      queryResults.find((result) => result.query.id === "doneRecent"),
    );
    const notification = briefingNotification(sectionResults, doneStats);
    sendNotification(notification.title, notification.body);
    return 0;
  } catch (error) {
    sendNotification("⚠ 브리핑 실패", shortMessage(error));
    return 0;
  }
}

if (process.argv[2] === "transition") {
  runTransition()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      const key = String(process.argv[3] || "").trim() || "?";
      sendNotification(`⚠ 전이 실패: ${key}`, shortMessage(error));
      process.exitCode = 0;
    });
} else if (process.argv[2] === "stale-report") {
  runStaleReport().then((code) => {
    process.exitCode = code;
  });
} else if (process.argv[2] === "briefing") {
  runBriefing().then((code) => {
    process.exitCode = code;
  });
} else {
  main().catch((error) => {
    const config = {
      baseUrl: "",
    };
    process.stdout.write(
      `${renderAllFailed(config, [{ ok: false, error }])}\n`,
    );
  });
}
