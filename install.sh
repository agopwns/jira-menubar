#!/bin/bash
set -euo pipefail

umask 077

REPO_RAW="${JIRA_MENUBAR_REPO_RAW:-https://raw.githubusercontent.com/agopwns/jira-menubar/main}"
PLUGIN_NAME="jira-tickets.5m.js"
CONFIG_DIR="${JIRA_MENUBAR_CONFIG_DIR:-$HOME/.config/jira-menubar}"
CONFIG_FILE="$CONFIG_DIR/config.json"
FORCE_SETUP=false
SKIP_SETUP=false
SOURCE_DIR="${JIRA_MENUBAR_SOURCE_DIR:-}"
TMP_DIR=""
PLUGIN_TARGET_TMP=""
CONFIG_TARGET_TMP=""

usage() {
  cat <<'EOF'
Usage: install.sh [options]

Options:
  --reconfigure  Re-enter Jira credentials and team settings.
  --skip-setup   Install the plugin and create an example config for manual setup.
  -h, --help     Show this help.
EOF
}

die() {
  echo "Error: $*" >&2
  exit 1
}

cleanup() {
  if [ -n "$PLUGIN_TARGET_TMP" ]; then
    rm -f "$PLUGIN_TARGET_TMP"
  fi
  if [ -n "$CONFIG_TARGET_TMP" ]; then
    rm -f "$CONFIG_TARGET_TMP"
  fi
  if [ -n "$TMP_DIR" ] && [ -d "$TMP_DIR" ]; then
    rm -rf "$TMP_DIR"
  fi
}

trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

while [ "$#" -gt 0 ]; do
  case "$1" in
    --reconfigure)
      FORCE_SETUP=true
      ;;
    --skip-setup)
      SKIP_SETUP=true
      ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      die "Unknown option: $1"
      ;;
  esac
  shift
done

if [ "$FORCE_SETUP" = true ] && [ "$SKIP_SETUP" = true ]; then
  die "--reconfigure and --skip-setup cannot be used together."
fi

command -v curl >/dev/null 2>&1 || die "curl is required."

NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  die "Node.js was not found. Install Node.js 18 or newer: brew install node"
fi
case "$NODE_BIN" in
  /*) ;;
  *) die "Node.js must resolve to an absolute executable path: $NODE_BIN" ;;
esac
if [ ! -x "$NODE_BIN" ]; then
  die "Node.js is not executable: $NODE_BIN"
fi

NODE_MAJOR="$("$NODE_BIN" -p 'Number(process.versions.node.split(".")[0])')"
case "$NODE_MAJOR" in
  '' | *[!0-9]*)
    die "Unable to determine the Node.js version."
    ;;
esac
if [ "$NODE_MAJOR" -lt 18 ]; then
  die "Node.js 18 or newer is required. Current version: $("$NODE_BIN" --version)"
fi
case "$NODE_BIN" in
  *' '*)
    die "The Node.js path contains a space and cannot be used as a shebang: $NODE_BIN"
    ;;
esac

if [ -n "${JIRA_MENUBAR_PLUGIN_DIR:-}" ]; then
  PLUGIN_DIR="$JIRA_MENUBAR_PLUGIN_DIR"
else
  PLUGIN_DIR="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
fi
if [ -z "$PLUGIN_DIR" ]; then
  die "SwiftBar plugin directory not found. Install and launch SwiftBar, choose a plugin folder, then run this installer again."
fi
case "$PLUGIN_DIR" in
  '~/'*)
    PLUGIN_DIR="$HOME/${PLUGIN_DIR#'~/'}"
    ;;
esac
if [ ! -d "$PLUGIN_DIR" ]; then
  die "SwiftBar plugin directory does not exist: $PLUGIN_DIR"
fi
if [ ! -w "$PLUGIN_DIR" ]; then
  die "SwiftBar plugin directory is not writable: $PLUGIN_DIR"
fi

if [ -z "$SOURCE_DIR" ] && [ -n "${BASH_SOURCE[0]:-}" ] && [ -f "${BASH_SOURCE[0]}" ]; then
  SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
  if [ -f "$SCRIPT_DIR/$PLUGIN_NAME" ]; then
    SOURCE_DIR="$SCRIPT_DIR"
  fi
fi

TMP_DIR="$(mktemp -d "${TMPDIR:-/tmp}/jira-menubar.XXXXXX")"
chmod 700 "$TMP_DIR"

stage_source_file() {
  local name="$1"
  local destination="$2"

  if [ -n "$SOURCE_DIR" ]; then
    if [ ! -f "$SOURCE_DIR/$name" ]; then
      die "Source file not found: $SOURCE_DIR/$name"
    fi
    cp "$SOURCE_DIR/$name" "$destination"
  else
    curl -fsSL --connect-timeout 10 --max-time 60 "$REPO_RAW/$name" -o "$destination"
  fi

  if [ ! -s "$destination" ]; then
    die "Downloaded file is empty: $name"
  fi
}

STAGED_PLUGIN="$TMP_DIR/$PLUGIN_NAME"
stage_source_file "$PLUGIN_NAME" "$STAGED_PLUGIN.source"
FIRST_LINE="$(head -n 1 "$STAGED_PLUGIN.source")"
if [ "${FIRST_LINE#'#!'}" != "$FIRST_LINE" ]; then
  {
    printf '#!%s\n' "$NODE_BIN"
    tail -n +2 "$STAGED_PLUGIN.source"
  } >"$STAGED_PLUGIN"
else
  {
    printf '#!%s\n' "$NODE_BIN"
    tail -n +1 "$STAGED_PLUGIN.source"
  } >"$STAGED_PLUGIN"
fi
"$NODE_BIN" --check "$STAGED_PLUGIN"

if [ -e "$CONFIG_FILE" ] && [ ! -f "$CONFIG_FILE" ]; then
  die "Config path exists but is not a regular file: $CONFIG_FILE"
fi

CONFIG_COMPLETE=false
if [ -f "$CONFIG_FILE" ]; then
  if ! "$NODE_BIN" -e '
    const fs = require("node:fs");
    try {
      const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        process.exit(1);
      }
    } catch {
      process.exit(1);
    }
  ' "$CONFIG_FILE"; then
    die "Existing config is not a valid JSON object: $CONFIG_FILE"
  fi
  chmod 700 "$CONFIG_DIR"
  chmod 600 "$CONFIG_FILE"

  if "$NODE_BIN" -e '
    const fs = require("node:fs");
    const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const complete =
      typeof config.baseUrl === "string" &&
      /^https:\/\//.test(config.baseUrl) &&
      !config.baseUrl.includes("your-site") &&
      typeof config.email === "string" &&
      config.email.includes("@") &&
      !config.email.includes("example.com") &&
      typeof config.apiToken === "string" &&
      config.apiToken.trim() &&
      typeof config.myAccountId === "string" &&
      config.myAccountId.trim() &&
      Array.isArray(config.projects) &&
      config.projects.length > 0;
    process.exit(complete ? 0 : 1);
  ' "$CONFIG_FILE"; then
    CONFIG_COMPLETE=true
  fi
fi

CONFIG_ACTION="keep"
if [ "$FORCE_SETUP" = true ]; then
  CONFIG_ACTION="configure"
elif [ ! -f "$CONFIG_FILE" ]; then
  if [ "$SKIP_SETUP" = true ]; then
    CONFIG_ACTION="scaffold"
  else
    CONFIG_ACTION="configure"
  fi
elif [ "$SKIP_SETUP" = false ] && [ "$CONFIG_COMPLETE" = false ]; then
  CONFIG_ACTION="configure"
fi

STAGED_CONFIG=""
if [ "$CONFIG_ACTION" = "scaffold" ]; then
  STAGED_CONFIG="$TMP_DIR/config.json"
  stage_source_file "config.example.json" "$STAGED_CONFIG"
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const value = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error("config.example.json must contain a JSON object");
    }
  ' "$STAGED_CONFIG"
fi

prompt_required() {
  local label="$1"

  while true; do
    printf '%s' "$label" >&3
    if ! IFS= read -r REPLY <&3; then
      die "Input was cancelled."
    fi
    if [ -n "$REPLY" ]; then
      return 0
    fi
    printf 'A value is required.\n' >&3
  done
}

prompt_optional() {
  local label="$1"
  printf '%s' "$label" >&3
  if ! IFS= read -r REPLY <&3; then
    die "Input was cancelled."
  fi
}

prompt_secret() {
  local label="$1"

  while true; do
    printf '%s' "$label" >&3
    if ! IFS= read -r -s REPLY <&3; then
      printf '\n' >&3
      die "Input was cancelled."
    fi
    printf '\n' >&3
    if [ -n "$REPLY" ]; then
      return 0
    fi
    printf 'A value is required.\n' >&3
  done
}

trim_value() {
  printf '%s' "$1" | sed 's/^[[:space:]]*//; s/[[:space:]]*$//'
}

normalize_base_url() {
  "$NODE_BIN" -e '
    const fs = require("node:fs");
    const input = fs.readFileSync(0, "utf8").trim();
    try {
      const url = new URL(input);
      if (url.protocol !== "https:" || url.username || url.password) {
        throw new Error();
      }
      const hostname = url.hostname.toLowerCase();
      if (hostname !== "atlassian.net" && !hostname.endsWith(".atlassian.net")) {
        throw new Error();
      }
      if (url.pathname !== "/" || url.search || url.hash) {
        throw new Error();
      }
      process.stdout.write(url.origin);
    } catch {
      console.error("Enter your Jira Cloud URL in this format: https://your-site.atlassian.net");
      process.exit(1);
    }
  '
}

validate_jira_account() {
  printf '%s\0%s\0%s\0' "$BASE_URL" "$EMAIL" "$API_TOKEN" | "$NODE_BIN" -e '
    const fs = require("node:fs");
    const [baseUrl, email, apiToken] = fs
      .readFileSync(0)
      .toString("utf8")
      .split("\0");

    async function main() {
      const response = await fetch(
        new URL("/rest/api/3/myself", `${baseUrl}/`),
        {
          headers: {
            Authorization: `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`,
            Accept: "application/json",
          },
          signal: AbortSignal.timeout(10000),
        },
      );

      if (!response.ok) {
        const hints = {
          401: "Check the email and API token. The current version requires an unscoped API token.",
          403: "Check Jira permissions and confirm that the token is not a scoped token.",
          404: "Check the Jira site URL.",
          429: "Jira rate limited the request. Wait briefly and try again.",
        };
        throw new Error(
          `Jira connection failed (HTTP ${response.status}). ${hints[response.status] || "Try again shortly."}`,
        );
      }

      const account = await response.json();
      if (!account || typeof account.accountId !== "string" || !account.accountId) {
        throw new Error("Jira returned an invalid account response.");
      }
      process.stdout.write(account.accountId);
    }

    main().catch((error) => {
      const message = error && error.name === "TimeoutError"
        ? "Jira connection timed out. Check the network and try again."
        : error.message;
      console.error(message);
      process.exit(1);
    });
  '
}

validate_projects() {
  printf '%s\0%s\0%s\0%s\0' \
    "$BASE_URL" \
    "$EMAIL" \
    "$API_TOKEN" \
    "$PROJECTS_RAW" | "$NODE_BIN" -e '
      const fs = require("node:fs");
      const [baseUrl, email, apiToken, projectsRaw] = fs
        .readFileSync(0)
        .toString("utf8")
        .split("\0");
      const projects = [...new Set(
        projectsRaw
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      )];
      const invalidKey = projects.find((key) => !/^[A-Z][A-Z0-9_]*$/.test(key));
      if (invalidKey) {
        console.error(`Invalid Jira project key: ${invalidKey}`);
        process.exit(1);
      }

      async function main() {
        const authorization = `Basic ${Buffer.from(`${email}:${apiToken}`).toString("base64")}`;
        for (const key of projects) {
          const response = await fetch(
            new URL(`/rest/api/3/project/${encodeURIComponent(key)}`, `${baseUrl}/`),
            {
              headers: { Authorization: authorization, Accept: "application/json" },
              signal: AbortSignal.timeout(10000),
            },
          );
          if (!response.ok) {
            throw new Error(
              `Project ${key} could not be accessed (HTTP ${response.status}). Check the key and your Jira permissions.`,
            );
          }
        }
      }

      main().catch((error) => {
        const message = error && error.name === "TimeoutError"
          ? "Project verification timed out. Check the network and try again."
          : error.message;
        console.error(message);
        process.exit(1);
      });
    '
}

write_config() {
  local source_config="$1"
  local destination="$2"

  printf '%s\0%s\0%s\0%s\0%s\0%s\0' \
    "$BASE_URL" \
    "$EMAIL" \
    "$API_TOKEN" \
    "$ACCOUNT_ID" \
    "$PROJECTS_RAW" \
    "$BOARD_ID" | "$NODE_BIN" -e '
      const fs = require("node:fs");
      const [baseUrl, email, apiToken, myAccountId, projectsRaw, boardId] = fs
        .readFileSync(0)
        .toString("utf8")
        .split("\0");
      const config = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
      if (!config || typeof config !== "object" || Array.isArray(config)) {
        throw new Error("The config file must contain a JSON object.");
      }
      const projects = [...new Set(
        projectsRaw
          .split(",")
          .map((value) => value.trim().toUpperCase())
          .filter(Boolean),
      )];
      if (projects.length === 0) {
        throw new Error("At least one Jira project key is required.");
      }
      Object.assign(config, {
        baseUrl,
        email,
        apiToken,
        myAccountId,
        boardId,
        projects,
      });
      fs.writeFileSync(process.argv[2], `${JSON.stringify(config, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
      });
    ' "$source_config" "$destination"
}

if [ "$CONFIG_ACTION" = "configure" ]; then
  if ! { exec 3<>/dev/tty; } 2>/dev/null; then
    die "Interactive setup requires a terminal. Run this command in Terminal, or use --skip-setup for manual configuration."
  fi

  printf '\nJira Menubar account setup\n' >&3
  printf 'Create an unscoped API token at:\n%s\n\n' \
    'https://id.atlassian.com/manage-profile/security/api-tokens' >&3

  prompt_required 'Jira site URL (https://your-site.atlassian.net): '
  if ! BASE_URL="$(printf '%s' "$REPLY" | normalize_base_url)"; then
    die "Invalid Jira site URL."
  fi

  prompt_required 'Atlassian email: '
  EMAIL="$(trim_value "$REPLY")"
  case "$EMAIL" in
    *@*) ;;
    *) die "Enter a valid Atlassian email address." ;;
  esac

  XTRACE_WAS_ON=false
  case "$-" in
    *x*)
      XTRACE_WAS_ON=true
      set +x
      ;;
  esac

  prompt_secret 'API token (input is hidden): '
  API_TOKEN="$REPLY"
  printf 'Checking Jira account...\n' >&3
  if ! ACCOUNT_ID="$(validate_jira_account)"; then
    unset API_TOKEN REPLY
    die "Jira account verification failed. No settings were changed."
  fi
  printf 'Jira account verified.\n\n' >&3

  prompt_required 'Project keys, comma-separated (for example DEV,APP): '
  PROJECTS_RAW="$(trim_value "$REPLY")"
  if [ -z "$(printf '%s' "$PROJECTS_RAW" | tr -d '[:space:],')" ]; then
    unset API_TOKEN REPLY
    die "At least one Jira project key is required."
  fi
  printf 'Checking project access...\n' >&3
  if ! validate_projects; then
    unset API_TOKEN REPLY
    die "Jira project verification failed. No settings were changed."
  fi
  printf 'Project access verified.\n\n' >&3

  prompt_optional 'Board ID for sprint stats (optional, press Enter to skip): '
  BOARD_ID="$(trim_value "$REPLY")"
  case "$BOARD_ID" in
    '' ) ;;
    *[!0-9]*)
      unset API_TOKEN REPLY
      die "Board ID must contain digits only."
      ;;
  esac

  if [ -f "$CONFIG_FILE" ]; then
    CONFIG_BASE="$CONFIG_FILE"
  else
    CONFIG_BASE="$TMP_DIR/config.example.json"
    stage_source_file "config.example.json" "$CONFIG_BASE"
  fi
  STAGED_CONFIG="$TMP_DIR/config.json"
  write_config "$CONFIG_BASE" "$STAGED_CONFIG"
  chmod 600 "$STAGED_CONFIG"

  unset API_TOKEN REPLY
  if [ "$XTRACE_WAS_ON" = true ]; then
    set -x
  fi
  exec 3>&-
fi

PLUGIN_TARGET="$PLUGIN_DIR/$PLUGIN_NAME"
PLUGIN_TARGET_TMP="$(mktemp "$PLUGIN_DIR/.$PLUGIN_NAME.install.XXXXXX")"
install -m 0755 "$STAGED_PLUGIN" "$PLUGIN_TARGET_TMP"

if [ "$CONFIG_ACTION" != "keep" ]; then
  mkdir -p "$CONFIG_DIR"
  chmod 700 "$CONFIG_DIR"
  CONFIG_TARGET_TMP="$(mktemp "$CONFIG_DIR/.config.json.install.XXXXXX")"
  install -m 0600 "$STAGED_CONFIG" "$CONFIG_TARGET_TMP"
fi

if [ "$CONFIG_ACTION" != "keep" ]; then
  mv -f "$CONFIG_TARGET_TMP" "$CONFIG_FILE"
  CONFIG_TARGET_TMP=""
fi
mv -f "$PLUGIN_TARGET_TMP" "$PLUGIN_TARGET"
PLUGIN_TARGET_TMP=""

if [ "${JIRA_MENUBAR_NO_OPEN:-0}" != "1" ]; then
  open -g "swiftbar://refreshplugin?name=jira-tickets" 2>/dev/null || true
fi

echo "Installed $PLUGIN_NAME to $PLUGIN_DIR"
case "$CONFIG_ACTION" in
  configure)
    echo "Jira account verified and config saved to $CONFIG_FILE"
    ;;
  scaffold)
    echo "Config scaffolded at $CONFIG_FILE — fill in baseUrl, email, apiToken, myAccountId, and projects."
    ;;
  keep)
    echo "Existing config kept at $CONFIG_FILE (use --reconfigure to replace account settings)."
    ;;
esac
