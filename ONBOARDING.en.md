# Jira Menubar Team Onboarding

Jira Menubar is a SwiftBar plugin that lets you view your Jira tickets from the macOS menu bar and add comments, assign issues, or change their status. Initial setup takes about five minutes.

## 1. Prerequisites

You will need:

- macOS
- A Jira Cloud account with access to your team's projects
- [Homebrew](https://brew.sh/)
- Your Jira project keys, such as `DEV` or `APP`

Install SwiftBar and Node.js 18 or later.

```bash
brew install swiftbar node
open -a SwiftBar
```

When you launch SwiftBar for the first time, it will ask you to choose a plugin folder. Select any folder you want, then continue to the next step.

## 2. Create an API token

Create a token specifically for this plugin on the [Atlassian API tokens page](https://id.atlassian.com/manage-profile/security/api-tokens).

- Suggested token name: `jira-menubar`
- For the current version, select **Create API token**.
- Scoped tokens created with **Create API token with scopes** are not compatible with the current version.
- The token is shown only once, immediately after it is created. Keep it somewhere safe until setup is complete.

## 3. Install and connect your account

Run the following command in Terminal.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash'
```

Enter the following information when prompted:

1. Jira site URL: `https://your-company.atlassian.net`
2. Your Atlassian login email
3. The API token you just created (your input will not be displayed)
4. Project keys, separated by commas if there is more than one, such as `DEV,APP`
5. Board ID; press Enter to skip this if you do not need sprint statistics

The installer verifies your Jira account and access to each project, then saves your `accountId` automatically. If verification fails, it does not change your existing plugin or configuration.

## 4. Verify the installation

Refresh the plugin in SwiftBar, then check the menu bar.

- If you see `J` and a ticket count, installation is complete.
- If you see `J⚙`, setup is incomplete.
- If you see `J!`, open the widget and check the Jira error message.

If the status is not `J!`, the ticket sections appear without errors, and `조회 HH:MM · N분 주기 · v...` appears at the bottom of the widget, the plugin is running correctly. The default is five minutes.

## Match your team's configuration

The configuration file is located at `~/.config/jira-menubar/config.json`. You can also open it from **⚙️ 위젯 설정 (Widget settings) → config 파일 열기 (Open config file)** in the widget.

| Setting               | Purpose                                                                                   |
| --------------------- | ----------------------------------------------------------------------------------------- |
| `projects`            | Project keys used to retrieve new tickets and sprints                                     |
| `pollIntervalMinutes` | Automatic Jira query interval; choose 5, 10, 15, 30, or 60 minutes in the widget settings |
| `sectionDisplay`      | Built-in ticket-region visibility and expanded/submenu layout                             |
| `statusBuckets`       | Your Jira status names, grouped into immediate, in-progress, and planned work             |
| `transitionTargets`   | Target statuses shown in the quick status-change menu                                     |
| `boardId`             | Board ID used for active sprint statistics (optional)                                     |
| `customSections`      | Additional JQL sections your team wants to see (optional)                                 |

Each value in `statusBuckets` must exactly match the status name displayed in Jira. Tickets with an unmatched status do not disappear; they are shown under **기타 내 티켓 (Other tickets assigned to me)**.

You can find the board ID in the Jira board URL, either after `/boards/<number>` or in `rapidView=<number>`.

To reduce automatic queries, choose an interval under **⚙️ 위젯 설정 (Widget settings) → Jira 조회 주기 (Jira query interval)**. Manual **🔄 새로고침 (Refresh)** always queries Jira immediately regardless of this setting.

If many tickets make the menu too long, open **⚙️ 위젯 설정 (Widget settings) → 🗂 티켓 영역 (Ticket regions)**. Uncheck regions you do not need, or choose **접어서 보기 — 하위 메뉴 (Fold into submenus)**. Folded mode leaves only each region title and count in the root menu; its tickets and quick actions remain available in the nested menu.

## Optional: the tickets CLI for your terminal

A terminal dashboard ships alongside the menu bar widget and reuses the exact same config file — no extra setup beyond a symlink.

```
ln -sf "<repo path>/bin/tickets" ~/.local/bin/tickets
tickets            # render once
tickets -w 120     # live view, refreshed every 2 minutes
```

Tickets are grouped into moved-by-others, urgent, in progress, testing, and planned sections. Rows gain a `●` marker when a local git worktree is checked out on a branch containing the ticket key, and `▶` when a tmux pane is active inside that worktree. See `tickets --help` and the "Terminal ticket dashboard" section of the README for all options.

## Update or reconfigure

To update, run the installation command again. If your existing configuration is complete, the installer preserves it and replaces only the plugin. If required values are missing, onboarding runs again. If the configuration contains invalid JSON, the installer reports an error instead of overwriting it.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash'
```

To re-enter your account, token, project, or board settings, use the following command. Your style settings and custom sections are preserved.

```bash
/bin/bash -o pipefail -c 'curl -fsSL https://raw.githubusercontent.com/agopwns/jira-menubar/main/install.sh | /bin/bash -s -- --reconfigure'
```

Developers who have cloned the Git repository can run `./install.sh` to install the plugin from the currently checked-out version.

## Troubleshooting

| Symptom                               | What to check                                                                                          |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `SwiftBar plugin directory not found` | Launch SwiftBar, select a plugin folder, then run the installer again                                  |
| `Node.js was not found`               | Run `brew install node`, then run the installer again                                                  |
| `HTTP 401`                            | Check your email, whether the token has expired or been revoked, and whether it is an unscoped token   |
| `HTTP 403`                            | Check your permission to view, assign, comment on, and change the status of issues in the Jira project |
| Only the new-ticket section fails     | Make sure `projects` contains project keys, not project names                                          |
| All tickets appear under Other        | Make sure the names in `statusBuckets` match the Jira status names                                     |
| The sprint is not displayed           | Check `boardId` and your access to the Jira Software board                                             |
| `bad interpreter`                     | The Node.js path has changed; run the installation command again                                       |
| Notifications do not appear           | In System Settings → Notifications, allow notifications from Script Editor                             |

If the problem persists, first share only the error text shown in the plugin menu. In addition to the token, the configuration file contains your email, site URL, account ID, project keys, and custom JQL. Do not share the entire file in Slack, Git, or an issue.

## Security and removal

- The API token is stored in `~/.config/jira-menubar/config.json`, not in the Git repository.
- The configuration file uses permission mode `600`, so only its owner can read it.
- `~/.cache/jira-menubar` may contain ticket keys and titles. Its directory uses mode `700`, and its files use mode `600`.
- The token is stored as plain text in the configuration file, not in macOS Keychain.
- The plugin views, assigns, comments on, and changes the status of Jira tickets using the signed-in user's permissions.
- Revoke tokens you no longer use from the [Atlassian API tokens page](https://id.atlassian.com/manage-profile/security/api-tokens).

To remove the plugin, delete `jira-tickets.5m.js` from the SwiftBar plugin folder. To remove your personal configuration and cache as well, also delete `~/.config/jira-menubar` and `~/.cache/jira-menubar`.
