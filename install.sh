#!/usr/bin/env bash
# install.sh — Install semble-hooks for your AI coding CLI
# Usage: ./install.sh [claude-code|codex|gemini|all]
set -u

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
HOOKS_HOME="${SEMBLE_HOOKS_HOME:-$HOME/.semble-hooks}"

info() { echo "[semble-hooks] $*"; }
warn() { echo "[semble-hooks] WARNING: $*" >&2; }
fail() { echo "[semble-hooks] ERROR: $*" >&2; exit 1; }

check_semble() {
  if command -v semble &>/dev/null; then
    info "semble CLI found: $(command -v semble)"
  else
    warn "semble CLI not found. Install it: pip install semble"
    warn "Hooks will be installed but won't do anything until semble is available."
  fi
}

install_scripts() {
  mkdir -p "$HOOKS_HOME/scripts" "$HOOKS_HOME/hooks"
  cp "$SCRIPT_DIR/scripts/config.mjs" "$HOOKS_HOME/scripts/"
  cp "$SCRIPT_DIR/scripts/debug-log.mjs" "$HOOKS_HOME/scripts/"
  cp "$SCRIPT_DIR/scripts/code-recall.mjs" "$HOOKS_HOME/scripts/"
  cp "$SCRIPT_DIR/scripts/code-bootstrap.mjs" "$HOOKS_HOME/scripts/"
  info "scripts → $HOOKS_HOME/scripts/"
}

install_claude_code() {
  local settings_dir="$HOME/.claude"
  mkdir -p "$settings_dir"

  # Copy hook definition
  cp "$SCRIPT_DIR/hooks/claude-code.json" "$HOOKS_HOME/hooks/"
  info "claude-code hook definition → $HOOKS_HOME/hooks/claude-code.json"

  # Check if settings.json exists and has hooks
  local settings="$settings_dir/settings.json"
  if [[ -f "$settings" ]]; then
    if grep -q "semble" "$settings" 2>/dev/null; then
      info "claude-code: hooks already registered in $settings"
      return
    fi
  fi

  info "claude-code: To activate, add to $settings under \"hooks\":"
  info "  \"UserPromptSubmit\": [{\"matcher\": \"\", \"hooks\": [{\"type\": \"command\", \"command\": \"node $HOOKS_HOME/scripts/code-recall.mjs\", \"timeout\": 8}]}]"
  info "  \"SessionStart\": [{\"hooks\": [{\"type\": \"command\", \"command\": \"node $HOOKS_HOME/scripts/code-bootstrap.mjs\", \"timeout\": 120}]}]"
  info "  Or set SEMBLE_HOOKS_ROOT=$HOOKS_HOME and use the hook definition file."
}

install_codex() {
  local mkt="$HOME/local-marketplace"
  local dir="$mkt/plugins/semble-hooks"
  mkdir -p "$dir/scripts" "$dir/.codex-plugin"

  # Plugin manifest
  cat > "$dir/.codex-plugin/plugin.json" << 'PLUGIN'
{
  "name": "semble-hooks",
  "version": "1.0.0",
  "description": "Code-intelligence hooks powered by Semble semantic search"
}
PLUGIN

  cp "$SCRIPT_DIR/hooks/codex-cli.json" "$dir/hooks.json"
  cp "$SCRIPT_DIR/scripts/code-recall.mjs" "$dir/scripts/"
  cp "$SCRIPT_DIR/scripts/config.mjs" "$dir/scripts/"
  cp "$SCRIPT_DIR/scripts/debug-log.mjs" "$dir/scripts/"

  # Marketplace manifest
  mkdir -p "$mkt/.agents/plugins"
  if [[ -f "$mkt/.agents/plugins/marketplace.json" ]]; then
    python3 -c "
import json
d=json.load(open('$mkt/.agents/plugins/marketplace.json'))
d.setdefault('plugins',{})['semble-hooks']={'installStatus':'INSTALLED_BY_DEFAULT','icon':'🔍'}
json.dump(d,open('$mkt/.agents/plugins/marketplace.json','w'),indent=2)
" 2>/dev/null || warn "Could not update marketplace.json — update manually"
  else
    cat > "$mkt/.agents/plugins/marketplace.json" << 'MKT'
{"plugins":{"semble-hooks":{"installStatus":"INSTALLED_BY_DEFAULT","icon":"🔍"}}}
MKT
  fi

  info "codex: plugin → $dir"
  info "  run: codex plugin marketplace add $mkt (if not already added)"
}

install_gemini() {
  local dir="$HOME/.gemini/extensions/semble-hooks"
  mkdir -p "$dir/scripts" "$dir/hooks"

  cp "$SCRIPT_DIR/hooks/gemini-cli.json" "$dir/hooks/hooks.json"
  cp "$SCRIPT_DIR/scripts/code-recall.mjs" "$dir/scripts/"
  cp "$SCRIPT_DIR/scripts/config.mjs" "$dir/scripts/"
  cp "$SCRIPT_DIR/scripts/debug-log.mjs" "$dir/scripts/"

  # Enable extension
  local enable="$HOME/.gemini/extensions/extension-enablement.json"
  if [[ -f "$enable" ]]; then
    python3 -c "
import json
d=json.load(open('$enable'))
d['semble-hooks']={'overrides':['~/*']}
json.dump(d,open('$enable','w'),indent=2)
" 2>/dev/null && info "gemini: extension enabled"
  fi

  info "gemini: extension → $dir"
}

# --- Main ---
CLI="${1:-all}"

check_semble
install_scripts

case "$CLI" in
  claude-code|claude) install_claude_code ;;
  codex)              install_codex ;;
  gemini)             install_gemini ;;
  all)
    install_claude_code
    install_codex
    install_gemini
    ;;
  *) fail "Unknown CLI: $CLI. Use: claude-code, codex, gemini, all" ;;
esac

info "done. Hooks installed to $HOOKS_HOME"
info "Debug: set SEMBLE_HOOKS_DEBUG=1 for logging to $HOOKS_HOME/logs/hooks.log"
