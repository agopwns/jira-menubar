# CLAUDE.md

Single-file SwiftBar plugin (`jira-tickets.5m.js`, Node.js built-ins only, no npm deps). Everything — rendering, Jira API, CLI action modes, PNG drawing — lives in that one file by design. Keep it that way.

## Architecture

- **Entry dispatch**: `process.argv[2]` selects CLI mode (`set` / `seen` / `seen-all` / `transition` / `stale-report` / `briefing`) or falls through to render mode.
- **Render pipeline**: `readConfig` → normalize (every config key has a default; invalid values fall back silently) → `buildSectionDefs`/`buildQueryDefs` → `Promise.allSettled` fetch → client-side bucketing → SwiftBar text output.
- **Failure isolation is a hard rule**: a failing query renders a per-section error line; all queries failing renders the cached last-good dropdown; the plugin must NEVER crash or emit a stack trace (SwiftBar shows raw output).
- **Menu bar PNG**: hand-encoded (zlib IDAT + manual chunks + pHYs 144dpi for retina), pixel-font glyphs, shape system via scanline insets (`shapeRowInsets`). Test PNGs by decoding and checking pixels, not by eyeballing base64.

## Hard-won gotchas (do not relearn these)

- **SwiftBar runs plugins with an empty PATH** — shebang must be an absolute node path (install.sh rewrites it).
- **SwiftBar ANSI**: supports 16-color and 256-color (`38;5;N`) only. 24-bit (`38;2;R;G;B`) is silently ignored. Its 256-color palette formula is nonstandard (see `swiftBarAnsi256Palette`, which replicates it exactly) — map hex colors by nearest match against that simulated palette, never against the standard xterm cube.
- **Jira team-managed projects**: statuses with the same NAME have different IDs per project, and JQL name matching silently resolves to only one project. Never filter by status name in JQL — use `statusCategory`, status IDs, or fetch broad and bucket client-side by `status.name` (safe).
- **`templateImage=` must be monochrome** — any two-color menu bar rendering must use `image=` (base color resolved from `OS_APPEARANCE` env when no explicit color is set).
- Notifications go through `osascript`; escape quotes/backslashes (`appleScriptQuote`) and wrap every send in try/catch.

## Testing

- `node --check jira-tickets.5m.js` first, always.
- Offline harness pattern: mock `fetch`, point caches via `JIRA_MENUBAR_CACHE_DIR`, config via `JIRA_MENUBAR_CONFIG`, capture notifications via `JIRA_MENUBAR_NOTIFY_DRYRUN=<file>`.
- Live smoke test: run the plugin directly; first output line must be `| image=`, `| templateImage=`, or a text title — then `open -g "swiftbar://refreshplugin?name=jira-tickets"`.
- Setter round-trips must never touch `apiToken` (allowlist) and must preserve file mode 600.

## Release

- Version lives in the `version` const AND the `<xbar.version>` metadata comment — bump both.
- Before pushing: `grep -ci 'hermont\|712020:\|junha@' jira-tickets.5m.js` must be 0 (public repo).
- README raw URLs point at `main` — keep that the default branch.
