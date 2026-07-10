# jira-menubar

A [SwiftBar](https://github.com/swiftbar/SwiftBar) plugin that turns your macOS menu bar into a personal Jira control tower. Single file, zero dependencies (Node.js built-ins only).

| rounded                                | pill (filled)                           | ticket                               | bubble                               |
| -------------------------------------- | --------------------------------------- | ------------------------------------ | ------------------------------------ |
| ![rounded](docs/img/shape-rounded.png) | ![pill](docs/img/shape-pill-filled.png) | ![ticket](docs/img/shape-ticket.png) | ![bubble](docs/img/shape-bubble.png) |

## Features

- **Menu bar counter** — `J34·2!` = 34 open tickets, 2 needing immediate action. Rendered as a hand-drawn pixel-font PNG with 5 box shapes (rounded / pill / square / ticket / speech bubble), outline or filled, fully color-configurable — or plain text mode.
- **Dropdown sections** — action-needed, in-progress, planned, moved-by-others (activity you haven't seen), newly created, everything else, plus unlimited custom JQL sections.
- **Native notifications** — new urgent tickets, new comments (with **@mention detection**), weekly stale-ticket report, and a weekday morning briefing. All diff-based: no notification storms.
- **Quick actions** — open ticket, mark activity as seen, snooze moved activity for 1/3/7 days, assign a ticket to yourself, add a comment from a native dialog, and run status transitions with a confirm step (transition IDs resolved live per ticket).
- **Sprint footer** — optionally shows the active sprint, days remaining, and your incomplete/total sprint ticket count.
- **Done stats** — today / this week completion counts in the footer.
- **In-dropdown settings** — 25+ setting groups (colors per text region, sizes, box shape/stroke/padding, toggles) editable by clicking, no config editing needed.
- **Resilient** — per-section error isolation, cached last-good dropdown when offline, silent fallbacks everywhere. The widget never dies.

## Requirements

- macOS with [SwiftBar](https://github.com/swiftbar/SwiftBar) (`brew install swiftbar`)
- Node.js 18+ (`brew install node`)
- A Jira Cloud account + [API token](https://id.atlassian.com/manage-profile/security/api-tokens)

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | bash
```

The installer copies the plugin into your SwiftBar plugin folder, points the shebang at your Node.js, and scaffolds `~/.config/jira-menubar/config.json`.

Manual install: copy `jira-tickets.5m.js` into your SwiftBar plugin folder, `chmod +x` it, fix the shebang if Node isn't at `/opt/homebrew/bin/node`, and create the config below.

## Configuration

`~/.config/jira-menubar/config.json` (see [config.example.json](config.example.json)):

| Key                          | Description                                                                                                                                                                     |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `baseUrl`                    | `https://your-site.atlassian.net`                                                                                                                                               |
| `email`                      | Atlassian account email                                                                                                                                                         |
| `apiToken`                   | API token (file is chmod 600)                                                                                                                                                   |
| `myAccountId`                | Your accountId — `curl -su email:token '<baseUrl>/rest/api/3/myself' \| jq -r .accountId`                                                                                       |
| `boardId`                    | Jira board ID for the active-sprint footer. Empty by default (disabled); use the numeric ID from the board URL (`/boards/<id>`, or the `rapidView` parameter on classic boards) |
| `projects`                   | Project keys for the "newly created" section, e.g. `["ABC", "XYZ"]`                                                                                                             |
| `newTicketDays`              | Window for newly created tickets (default 3)                                                                                                                                    |
| `notifications` / `briefing` | Master toggles (default true)                                                                                                                                                   |
| `statusBuckets`              | Status names per bucket: `{ "urgent": [...], "inProgress": [...], "planned": [...] }`. Defaults are Korean workflow names — set yours here                                      |
| `transitionTargets`          | Quick-transition menu: `[{ "label": "✅ Done", "status": "Done" }]`. `[]` disables                                                                                              |
| `sectionTitles`              | Override built-in section titles by id (`urgent`, `inProgress`, `planned`, `movedByOthers`, `newTickets`, `otherMine`)                                                          |
| `customSections`             | Extra JQL sections: `[{ "title": "...", "jql": "...", "maxResults": 15 }]` (max 5)                                                                                              |
| `style`                      | Everything visual — all of it also editable from the in-dropdown ⚙️ settings menu                                                                                               |

> **Team-managed projects warning**: if two projects share a status _name_, JQL name matching silently hits only one of them. Use status IDs in custom JQL (`status = 10003`), and list all per-project names in `statusBuckets` (bucketing matches names client-side, which is safe).

Set `boardId` to a board's numeric ID to enable a footer such as `🏃 Sprint 12 · D-4 · 내 티켓 3/5`. The plugin reads the active sprint from Jira's board API and classifies completed tickets by `statusCategory`; if either sprint request fails, only this optional footer is omitted.

Moved-by-others tickets can be snoozed for 1, 3, or 7 days. A ticket reappears immediately if it receives activity after it was snoozed. Newly opened and moved tickets offer **🙋 나에게 할당** when `myAccountId` is configured and you are not already the assignee. Your ticket buckets and moved tickets offer **💬 코멘트 달기**, which opens a native macOS text dialog.

## CLI modes

The plugin doubles as its own CLI (used by the clickable menu items):

```
jira-tickets.5m.js                      # render (what SwiftBar runs)
jira-tickets.5m.js set <path> <value>   # change an allowlisted config value
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

## 한국어 빠른 시작

1. `brew install swiftbar node` 후 SwiftBar 실행, 플러그인 폴더 지정
2. 위 설치 스크립트 실행
3. [API 토큰 생성](https://id.atlassian.com/manage-profile/security/api-tokens) → `~/.config/jira-menubar/config.json`의 `apiToken`에 입력
4. 메뉴바의 위젯 클릭 → 새로고침

기본 상태명 버킷은 한국어 워크플로우(`검토 중`/`dev request` → 즉시 처리, `진행 중`, `계획 중`) 기준입니다. 다른 워크플로우면 `statusBuckets`를 수정하세요. 스타일(색·크기·박스 모양·여백)은 드롭다운 안 **⚙️ 위젯 설정**에서 클릭으로 바꿀 수 있습니다.

## License

MIT
