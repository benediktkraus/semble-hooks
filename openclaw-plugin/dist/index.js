import { definePluginEntry } from "openclaw/plugin-sdk/core";
import { execFileSync } from "node:child_process";

const DEFAULT_CFG = { topK: 5, semblePath: "semble", timeout: 8000, minQueryLength: 3 };

function parseSembleOutput(raw) {
  const chunks = [];
  const headerRe = /^## \d+\.\s+(\S+?)(?::(\d+)-(\d+))?\s+\[score=([\d.]+)\]/;
  const lines = raw.split("\n");
  let i = 0;
  while (i < lines.length) {
    const match = lines[i].match(headerRe);
    if (!match) { i++; continue; }
    const file = match[1];
    const startLine = match[2] ? parseInt(match[2], 10) : null;
    const endLine = match[3] ? parseInt(match[3], 10) : null;
    const score = parseFloat(match[4]);
    i++;
    if (i < lines.length && lines[i].startsWith("```")) i++;
    const codeLines = [];
    while (i < lines.length && !lines[i].startsWith("```")) {
      codeLines.push(lines[i]);
      i++;
    }
    if (i < lines.length && lines[i].startsWith("```")) i++;
    chunks.push({ file, startLine, endLine, score, code: codeLines.join("\n") });
  }
  return chunks;
}

function formatChunks(chunks) {
  const parts = chunks.map(c => {
    const loc = c.startLine ? `${c.file}:${c.startLine}-${c.endLine}` : c.file;
    return `### ${loc} (score: ${c.score.toFixed(3)})\n\`\`\`\n${c.code}\n\`\`\``;
  });
  return "<relevant-code>\nThe following code chunks from the current project may be relevant:\n" +
    parts.join("\n\n") + "\n</relevant-code>";
}

function findSemble(path) {
  try {
    if (path.startsWith("/")) {
      execFileSync(path, ["--help"], { stdio: "pipe", timeout: 5000 });
    } else {
      execFileSync("which", [path], { stdio: "pipe", timeout: 3000 });
    }
    return true;
  } catch { return false; }
}

function sembleSearch(query, cfg) {
  if (!query || query.length < cfg.minQueryLength) return null;
  if (!findSemble(cfg.semblePath)) return null;
  try {
    const raw = execFileSync(cfg.semblePath, ["search", query, ".", "-k", String(cfg.topK)], {
      encoding: "utf-8",
      timeout: cfg.timeout,
      cwd: process.cwd(),
      stdio: ["pipe", "pipe", "pipe"],
    });
    if (!raw || !raw.trim()) return null;
    const chunks = parseSembleOutput(raw);
    if (chunks.length === 0) return null;
    return formatChunks(chunks);
  } catch { return null; }
}

export default definePluginEntry({
  id: "semble-hooks",
  name: "Semble Code Intelligence",
  description: "Injects relevant code chunks via Semble semantic search",
  register(api) {
    const pluginCfg = api.config || {};
    const cfg = { ...DEFAULT_CFG, ...pluginCfg };

    api.hooks.on("before_prompt_build", async (event) => {
      const query = (event.prompt || "").trim();
      const block = sembleSearch(query, cfg);
      if (block) {
        api.logger.debug(`semble: injected ${block.length} chars for "${query.slice(0, 50)}..."`);
        return { appendSystemContext: block };
      }
      return {};
    });

    api.logger.info("semble-hooks: before_prompt_build hook registered");
  },
});
