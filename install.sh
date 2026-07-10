#!/bin/bash
set -euo pipefail

REPO_RAW="https://raw.githubusercontent.com/agopwns/jira-menubar/main"
PLUGIN_NAME="jira-tickets.5m.js"
CONFIG_DIR="$HOME/.config/jira-menubar"
CONFIG_FILE="$CONFIG_DIR/config.json"

# Resolve SwiftBar plugin directory
PLUGIN_DIR="$(defaults read com.ameba.SwiftBar PluginDirectory 2>/dev/null || true)"
if [ -z "$PLUGIN_DIR" ]; then
  echo "SwiftBar plugin directory not found. Install SwiftBar and set a plugin folder first:"
  echo "  brew install swiftbar"
  exit 1
fi

# Resolve node
NODE_BIN="$(command -v node || true)"
if [ -z "$NODE_BIN" ]; then
  echo "Node.js not found. Install it first: brew install node"
  exit 1
fi

# Fetch plugin and point shebang at the local node
TMP_FILE="$(mktemp)"
curl -fsSL "$REPO_RAW/$PLUGIN_NAME" -o "$TMP_FILE"
if [ "$(head -1 "$TMP_FILE")" != "#!$NODE_BIN" ]; then
  printf '#!%s\n' "$NODE_BIN" > "$TMP_FILE.shebang"
  tail -n +2 "$TMP_FILE" >> "$TMP_FILE.shebang"
  mv "$TMP_FILE.shebang" "$TMP_FILE"
fi
install -m 0755 "$TMP_FILE" "$PLUGIN_DIR/$PLUGIN_NAME"
rm -f "$TMP_FILE"

# Scaffold config if missing
if [ ! -f "$CONFIG_FILE" ]; then
  mkdir -p "$CONFIG_DIR"
  curl -fsSL "$REPO_RAW/config.example.json" -o "$CONFIG_FILE"
  chmod 600 "$CONFIG_FILE"
  echo "Config scaffolded at $CONFIG_FILE — fill in baseUrl, email, apiToken, myAccountId."
else
  echo "Existing config kept at $CONFIG_FILE"
fi

open -g "swiftbar://refreshplugin?name=jira-tickets" 2>/dev/null || true
echo "Installed $PLUGIN_NAME to $PLUGIN_DIR"
