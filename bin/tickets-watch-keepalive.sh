#!/bin/zsh
# Ensure the "tickets" tmux session is running the tickets watch.
# Invoked by launchd (com.jun.tickets-watch) every 60s and at login.
export PATH="$HOME/.local/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"
TMUX_BIN="$(command -v tmux)" || exit 0
"$TMUX_BIN" has-session -t tickets 2>/dev/null && exit 0
"$TMUX_BIN" new-session -d -s tickets -n watch \
  "while true; do '$HOME/.local/bin/tickets' -w 120; sleep 5; done"
