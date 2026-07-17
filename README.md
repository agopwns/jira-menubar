# jira-menubar

A [SwiftBar](https://github.com/swiftbar/SwiftBar) plugin that turns your macOS menu bar into a personal Jira control tower. Single file, zero dependencies (Node.js built-ins only).

> New teammate? Follow the **[English onboarding guide](ONBOARDING.en.md)** or **[한국어 온보딩 가이드](ONBOARDING.md)**. The installer verifies Jira access and discovers `accountId` automatically.

| rounded                                | pill (filled)                           | ticket                               | bubble                               |
| -------------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------------------ |
| ![rounded](docs/img/shape-rounded.png) | ![pill](docs/img/shape-pill-filled.png) | ![ticket](docs/img/shape-ticket.png) | ![bubble](docs/img/shape-bubble.png) |

The screenshot shapes can be combined with four one-click theme presets at the top of **⚙️ 위젯 설정**: **미니멀** (square, system colors), **터미널** (filled square, restrained green, Menlo), **티켓** (amber ticket outline), and **버블** (filled blue/cyan speech bubble). After applying a preset, every individual style setting remains editable for fine-tuning.

## Features

- **Menu bar counter** — `J34·2!` = 34 open tickets, 2 needing immediate action. Rendered as a hand-drawn pixel-font PNG with 5 box shapes (rounded / pill / square / ticket / speech bubble), outline or filled, fully color-configurable — or plain text mode.
- **Dropdown sections** — action-needed, in-progress, planned, moved-by-others (activity you haven't seen), newly created, everything else, plus up to five custom JQL sections.
- **Native notifications** — new urgent tickets, new comments (with **@mention detection**), weekly stale-ticket report, and a weekday morning briefing. All diff-based: no notification storms.
- **Quick actions** — open ticket, mark activity as seen, snooze moved activity for 1/3/7 days, assign a ticket to yourself, add a comment from a native dialog, and run status transitions with a confirm step (transition IDs resolved live per ticket).
- **Sprint footer** — optionally shows the active sprint, days remaining, and your incomplete/total sprint ticket count.
- **Done stats** — today / this week completion counts in the footer.
- **Configurable Jira polling** — choose a 5 / 10 / 15 / 30 / 60 minute Jira query interval from the widget. Manual refresh always queries immediately.
- **Section visibility and folding** — show only the built-in ticket regions you care about, or fold every populated region into a submenu so 30+ tickets do not fill the root dropdown.
- **Update checker** — checks GitHub at most once every 24 hours and quietly adds an update link to the footer when a newer semantic version is available. It is enabled by default and can be toggled in settings.
- **Theme presets** — switch the complete shape, fill, ANSI, font, and color bundle in one click, then fine-tune with the existing style controls.
- **In-dropdown settings** — 25+ setting groups (colors per text region, sizes, box shape/stroke/padding, toggles) editable by clicking, no config editing needed.
- **Resilient** — per-section error isolation, cached last-good dropdown when offline, silent fallbacks everywhere. The widget never dies.

## Requirements

- macOS with [SwiftBar](https://github.com/swiftbar/SwiftBar) (`brew install swiftbar`)
- Node.js 18+ (`brew install node`)
- A Jira Cloud account + an [unscoped API token](https://id.atlassian.com/manage-profile/security/api-tokens)

## Install

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash'
```

Launch SwiftBar and choose its plugin folder before running the command. On first install, the installer securely prompts for your Jira URL, email, API token, project keys, and optional board ID. It verifies the account and project access, discovers `myAccountId`, points the shebang at your local Node.js, and writes `~/.config/jira-menubar/config.json` with mode `600`.

Running the installer again updates the plugin and keeps an existing complete config. An incomplete config re-enters setup, while malformed JSON is left untouched and reported as an error. To replace the account settings:

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash -s -- --reconfigure'
```

When run from a local clone, `./install.sh` installs the checked-out plugin instead of downloading `main`. The advanced `--skip-setup` option creates the example config without connecting an account; all required fields must then be populated manually.

## Configuration

`~/.config/jira-menubar/config.json` (see [config.example.json](config.example.json)):

| Key                          | Description                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`                    | `https://your-site.atlassian.net`                                                                                                                                               |
| `email`                      | Atlassian account email                                                                                                                                                         |
| `apiToken`                   | API token (file is chmod 600)                                                                                                                                                   |
| `myAccountId`                | Your Jira account ID. The installer discovers it automatically                                                                                                                 |
| `boardId`                    | Jira board ID for the active-sprint footer. Empty by default (disabled); use the numeric ID from the board URL (`/boards/<id>`, or the `rapidView` parameter on classic boards) |
| `projects`                   | Project keys for the "newly created" section, e.g. `["ABC", "XYZ"]`                                                                                                             |
| `newTicketDays`              | Window for newly created tickets (default 3)                                                                                                                                    |
| `pollIntervalMinutes`        | Jira query interval: `5`, `10`, `15`, `30`, or `60` minutes (default 5). Also editable from ⚙️ settings; manual refresh bypasses the interval cache                               |
| `sectionDisplay`             | Ticket-region layout: `mode` is `expanded` (default) or `submenu`; `visible` toggles the seven built-in regions. All options are available under ⚙️ settings                    |
| `notifications` / `briefing` | Master toggles (default true)                                                                                                                                                   |
| `updateCheck`                | Check GitHub for a newer plugin version at most once every 24 hours (default true)                                                                                              |
| `statusBuckets`              | Status names per bucket: `{ "urgent": [...], "inProgress": [...], "planned": [...] }`. Defaults are Korean workflow names — set yours here                                      |
| `transitionTargets`          | Quick-transition menu: `[{ "label": "✅ Done", "status": "Done" }]`. `[]` disables                                                                                              |
| `sectionTitles`              | Override built-in section titles by id (`urgent`, `inProgress`, `planned`, `movedByOthers`, `newTickets`, `otherMine`)                                                          |
| `customSections`             | Extra JQL sections: `[{ "title": "...", "jql": "...", "maxResults": 15 }]` (max 5)                                                                                              |
| `style`                      | Everything visual — all of it also editable from the in-dropdown ⚙️ settings menu                                                                                               |

> **Team-managed projects warning**: if two projects share a status _name_, JQL name matching silently hits only one of them. Use status IDs in custom JQL (`status = 10003`), and list all per-project names in `statusBuckets` (bucketing matches names client-side, which is safe).

Set `boardId` to a board's numeric ID to enable a footer such as `🏃 Sprint 12 · D-4 · 내 티켓 3/5`. The plugin reads the active sprint from Jira's board API and classifies completed tickets by `statusCategory`; if either sprint request fails, only this optional footer is omitted.

Moved-by-others tickets can be snoozed for 1, 3, or 7 days. A ticket reappears immediately if it receives activity after it was snoozed. Newly opened and moved tickets offer **🙋 나에게 할당** when `myAccountId` is configured and you are not already the assignee. Your ticket buckets and moved tickets offer **💬 코멘트 달기**, which opens a native macOS text dialog.

SwiftBar still invokes the lightweight plugin process every five minutes because that base tick is encoded in the filename. For intervals longer than five minutes, scheduled runs reuse the last rendered output without contacting Jira until the selected interval has elapsed—even when the previous query failed. This reduces Jira API traffic and network/battery wake work; CPU and memory are only used briefly because the Node.js process exits after each run.

For a shorter dropdown, open **⚙️ 위젯 설정 → 🗂 티켓 영역**. Each checked built-in region can be hidden independently. **접어서 보기 — 하위 메뉴** keeps the region title and count in the root dropdown and moves its tickets and quick actions into a nested menu. Hidden regions still participate in the menu-bar total and notifications; this setting changes presentation only. Custom JQL sections remain visible and follow the selected expanded/submenu mode.

## CLI modes

The plugin doubles as its own CLI (used by the clickable menu items):

```
jira-tickets.5m.js                      # render (what SwiftBar runs)
jira-tickets.5m.js set <path> <value>   # change an allowlisted config value
jira-tickets.5m.js set style.preset terminal  # apply minimal / terminal / ticket / bubble
jira-tickets.5m.js seen <KEY> <iso>     # mark ticket activity as seen
jira-tickets.5m.js seen-all             # mark all moved-by-others as seen
jira-tickets.5m.js snooze <KEY> <days>  # snooze moved activity
jira-tickets.5m.js assign <KEY>          # assign the ticket to myAccountId
jira-tickets.5m.js comment <KEY>         # prompt for and add a comment
jira-tickets.5m.js transition <KEY> <status>  # transition a ticket
jira-tickets.5m.js stale-report         # send the stale report now
jira-tickets.5m.js briefing             # send the morning briefing now
```

Notifications come from `osascript` — if you don't see them, allow **Script Editor** in System Settings → Notifications.

---

## Onboarding guides

- **[English](ONBOARDING.en.md)**
- **[한국어](ONBOARDING.md)**
- **[v2.2.1 release record](docs/v2.2.1-release.md)**

## License

MIT
