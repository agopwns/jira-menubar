const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const pluginPath = path.resolve(__dirname, "..", "jira-tickets.5m.js");

function makeFixture(t, pollIntervalMinutes = 15, configOverrides = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jira-menubar-poll-"));
  const configPath = path.join(root, "config.json");
  const cacheDir = path.join(root, "cache");
  const fetchCountPath = path.join(root, "fetch-count.txt");
  const preloadPath = path.join(root, "mock-fetch.cjs");

  fs.mkdirSync(cacheDir, { mode: 0o700 });
  fs.writeFileSync(
    configPath,
    `${JSON.stringify(
      {
        baseUrl: "https://example.atlassian.net",
        email: "dev@example.org",
        apiToken: "test-token",
        myAccountId: "account-1",
        projects: ["DEV"],
        pollIntervalMinutes,
        notifications: false,
        briefing: false,
        updateCheck: false,
        ...configOverrides,
      },
      null,
      2,
    )}\n`,
    { mode: 0o600 },
  );
  fs.writeFileSync(
    preloadPath,
    [
      'const fs = require("node:fs");',
      "global.fetch = async (input) => {",
      '  fs.appendFileSync(process.env.FETCH_COUNT_FILE, "1\\n");',
      "  const status = Number(process.env.MOCK_FETCH_STATUS || 200);",
      "  const url = input instanceof URL ? input : new URL(String(input));",
      '  const jql = url.searchParams.get("jql") || "";',
      "  const issues =",
      '    process.env.MOCK_WITH_ISSUES === "1" &&',
      '    jql === "assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC"',
      "      ? [",
      "          {",
      '            key: "DEV-1",',
      "            fields: {",
      '              summary: "Test issue",',
      '              status: { name: "진행 중" },',
      '              priority: { name: "Medium" },',
      '              issuetype: { name: "Task" },',
      '              updated: "2026-07-14T12:00:00.000Z",',
      '              created: "2026-07-14T12:00:00.000Z",',
      "              assignee: {",
      '                accountId: "account-1",',
      '                displayName: "Dev",',
      "              },",
      "            },",
      "          },",
      "        ]",
      "      : [];",
      "  return new Response(JSON.stringify({ issues }), {",
      "    status,",
      '    headers: { "content-type": "application/json" },',
      "  });",
      "};",
      "",
    ].join("\n"),
  );

  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, configPath, cacheDir, fetchCountPath, preloadPath };
}

function writeCache(fixture, timestamp = Date.now()) {
  const output = "J42\n---\n캐시 본문\n";
  fs.writeFileSync(path.join(fixture.cacheDir, "last.txt"), output);
  fs.writeFileSync(
    path.join(fixture.cacheDir, "last.timestamp"),
    String(timestamp),
  );
  return output;
}

function runPlugin(fixture, options = {}) {
  const args = options.args || [];
  const result = spawnSync(
    process.execPath,
    ["--require", fixture.preloadPath, pluginPath, ...args],
    {
      encoding: "utf8",
      timeout: 15000,
      env: {
        ...process.env,
        JIRA_MENUBAR_CONFIG: fixture.configPath,
        JIRA_MENUBAR_CACHE_DIR: fixture.cacheDir,
        FETCH_COUNT_FILE: fixture.fetchCountPath,
        MOCK_FETCH_STATUS: String(options.fetchStatus || 200),
        MOCK_WITH_ISSUES: options.withIssues ? "1" : "0",
        SWIFTBAR_PLUGIN_REFRESH_REASON: options.refreshReason || "",
      },
    },
  );

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  return result;
}

function fetchCount(fixture) {
  try {
    return fs
      .readFileSync(fixture.fetchCountPath, "utf8")
      .trim()
      .split("\n").length;
  } catch (error) {
    if (error.code === "ENOENT") {
      return 0;
    }
    throw error;
  }
}

test("automatic schedule, launch, and wake reuse a fresh cache", (t) => {
  const fixture = makeFixture(t, 15);
  const cachedOutput = writeCache(fixture);

  for (const refreshReason of ["Schedule", "FirstLaunch", "WakeFromSleep"]) {
    const result = runPlugin(fixture, { refreshReason });

    assert.equal(result.stdout, cachedOutput);
  }
  assert.equal(fetchCount(fixture), 0);
});

test("scheduled refresh queries Jira once the selected interval elapsed", (t) => {
  const fixture = makeFixture(t, 15);
  writeCache(fixture, Date.now() - 15 * 60 * 1000);

  const result = runPlugin(fixture, { refreshReason: "Schedule" });

  assert.equal(fetchCount(fixture), 5);
  assert.doesNotMatch(result.stdout, /캐시 본문/);
  assert.match(result.stdout, /15분 주기 · v\d+\.\d+\.\d+/);
  assert.match(result.stdout, /---- ✓ 15분 \|/);
  for (const name of ["last-poll.txt", "last-poll.timestamp"]) {
    assert.equal(
      fs.statSync(path.join(fixture.cacheDir, name)).mode & 0o777,
      0o600,
    );
  }
  assert.equal(
    fs.readdirSync(fixture.cacheDir).some((name) => name.endsWith(".tmp")),
    false,
  );
});

test("manual refresh bypasses a fresh scheduled cache", (t) => {
  const fixture = makeFixture(t, 60);
  writeCache(fixture);

  const result = runPlugin(fixture, { refreshReason: "MenuAction" });

  assert.equal(fetchCount(fixture), 5);
  assert.doesNotMatch(result.stdout, /캐시 본문/);
  assert.match(result.stdout, /60분 주기 · v\d+\.\d+\.\d+/);
});

test("a failed poll is not retried on every five-minute SwiftBar tick", (t) => {
  const fixture = makeFixture(t, 15);
  writeCache(fixture, Date.now() - 15 * 60 * 1000);

  const firstResult = runPlugin(fixture, {
    refreshReason: "Schedule",
    fetchStatus: 503,
  });

  assert.equal(fetchCount(fixture), 5);
  assert.match(firstResult.stdout, /모든 Jira 조회 실패/);

  const secondResult = runPlugin(fixture, {
    refreshReason: "Schedule",
    fetchStatus: 503,
  });

  assert.equal(fetchCount(fixture), 5);
  assert.equal(secondResult.stdout, firstResult.stdout);
});

test("unsupported config values fall back to the five-minute default", (t) => {
  const fixture = makeFixture(t, 7);

  const result = runPlugin(fixture, { refreshReason: "FirstLaunch" });

  assert.equal(fetchCount(fixture), 5);
  assert.match(result.stdout, /5분 주기 · v\d+\.\d+\.\d+/);
  assert.match(result.stdout, /---- ✓ 5분 \(기본\) \|/);
});

test("poll interval setter accepts only supported values and keeps mode 600", (t) => {
  const fixture = makeFixture(t, 15);

  runPlugin(fixture, {
    args: ["set", "pollIntervalMinutes", "30"],
  });

  let config = JSON.parse(fs.readFileSync(fixture.configPath, "utf8"));
  assert.equal(config.pollIntervalMinutes, 30);
  assert.equal(config.apiToken, "test-token");
  assert.equal(fs.statSync(fixture.configPath).mode & 0o777, 0o600);

  runPlugin(fixture, {
    args: ["set", "pollIntervalMinutes", "7"],
  });

  config = JSON.parse(fs.readFileSync(fixture.configPath, "utf8"));
  assert.equal(config.pollIntervalMinutes, 30);
});

test("legacy configs keep ticket sections expanded by default", (t) => {
  const fixture = makeFixture(t, 5);

  const result = runPlugin(fixture, {
    refreshReason: "FirstLaunch",
    withIssues: true,
  });

  assert.match(result.stdout, /^🚧 진행 중 \(1\) \|/m);
  assert.match(result.stdout, /DEV-1/);
  assert.doesNotMatch(result.stdout, /^-- .*DEV-1.* ansi=true$/m);
});

test("invalid direct section settings fall back without hiding valid regions", (t) => {
  const fixture = makeFixture(t, 5, {
    sectionDisplay: {
      mode: "accordion",
      visible: { urgent: "false", planned: false },
    },
  });

  const result = runPlugin(fixture, {
    refreshReason: "FirstLaunch",
    withIssues: true,
  });

  assert.match(result.stdout, /^🔥 즉시 처리 \(0\)/m);
  assert.match(result.stdout, /^🚧 진행 중 \(1\) \|/m);
  assert.doesNotMatch(result.stdout, /^-- .*DEV-1.* ansi=true$/m);
  assert.match(
    result.stdout,
    /^---- 📋 계획 중 \|.*param3=true/m,
  );
});

test("submenu mode folds section tickets and their actions one level deeper", (t) => {
  const fixture = makeFixture(t, 5, {
    sectionDisplay: { mode: "submenu" },
  });

  const result = runPlugin(fixture, {
    refreshReason: "FirstLaunch",
    withIssues: true,
  });

  assert.match(result.stdout, /^🚧 진행 중 \(1\) \|/m);
  assert.match(result.stdout, /^-- .*DEV-1.* ansi=true$/m);
  assert.match(result.stdout, /^---- 티켓 열기 \|/m);
  assert.match(result.stdout, /^------ 확인 — 전이 실행 \|/m);
});

test("section visibility hides a region and exposes a one-click restore", (t) => {
  const fixture = makeFixture(t, 5, {
    sectionDisplay: {
      mode: "expanded",
      visible: { inProgress: false },
    },
    style: { outline: false },
  });

  const result = runPlugin(fixture, {
    refreshReason: "FirstLaunch",
    withIssues: true,
  });

  assert.doesNotMatch(result.stdout, /^🚧 진행 중 \(1\) \|/m);
  assert.match(result.stdout, /^J1 \|/);
  assert.equal(fetchCount(fixture), 5);
  assert.match(
    result.stdout,
    /^---- 🚧 진행 중 \|.*param2=sectionDisplay\.visible\.inProgress.*param3=true/m,
  );
});

test("hiding every built-in region leaves settings available for restore", (t) => {
  const fixture = makeFixture(t, 5, {
    sectionDisplay: {
      mode: "expanded",
      visible: {
        urgent: false,
        inProgress: false,
        planned: false,
        movedByOthers: false,
        newTickets: false,
        otherMine: false,
        stale: false,
      },
    },
    style: { outline: false },
  });

  const result = runPlugin(fixture, {
    refreshReason: "FirstLaunch",
    withIssues: true,
  });

  assert.match(result.stdout, /^J1 \|/);
  assert.doesNotMatch(result.stdout, /^🔥 즉시 처리 \(0\)/m);
  assert.doesNotMatch(result.stdout, /^🚧 진행 중 \(1\)/m);
  assert.match(result.stdout, /^⚙️ 위젯 설정 \|/m);
  assert.match(
    result.stdout,
    /^---- 🔥 즉시 처리 \|.*param3=true/m,
  );
});

test("section display setters preserve config secrets and reject invalid modes", (t) => {
  const fixture = makeFixture(t, 15);

  runPlugin(fixture, {
    args: ["set", "sectionDisplay.mode", "submenu"],
  });
  runPlugin(fixture, {
    args: ["set", "sectionDisplay.visible.planned", "false"],
  });
  runPlugin(fixture, {
    args: ["set", "sectionDisplay.mode", "accordion"],
  });

  const config = JSON.parse(fs.readFileSync(fixture.configPath, "utf8"));
  assert.equal(config.sectionDisplay.mode, "submenu");
  assert.equal(config.sectionDisplay.visible.planned, false);
  assert.equal(config.apiToken, "test-token");
  assert.equal(fs.statSync(fixture.configPath).mode & 0o777, 0o600);
});
