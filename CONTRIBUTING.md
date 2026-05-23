# Contributing to semble-hooks

## Setup

```bash
git clone https://github.com/benediktkraus/semble-hooks.git
cd semble-hooks
pip install semble  # Required for testing
```

No `npm install` needed — the project uses only Node.js built-ins.

## Testing

```bash
# Test code-recall with a query
echo '{"prompt":"your test query"}' | node scripts/code-recall.mjs

# Test with debug logging
echo '{"prompt":"your test query"}' | SEMBLE_HOOKS_DEBUG=1 node scripts/code-recall.mjs

# Test bootstrap
echo '{}' | node scripts/code-bootstrap.mjs

# Test graceful degradation (no semble)
echo '{"prompt":"test"}' | SEMBLE_PATH=/nonexistent node scripts/code-recall.mjs
# Should output: {"decision":"approve"}
```

## Code style

- ESM modules (`.mjs` extension)
- No npm dependencies — Node.js built-ins only
- `execFileSync` with array args (never `execSync`)
- Graceful degradation: hooks must never break the CLI

## Pull requests

1. Fork and create a branch
2. Test with all three CLIs if possible
3. Ensure graceful degradation works
4. Submit PR with description of what changed and why
