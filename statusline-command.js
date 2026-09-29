#!/usr/bin/env node
"use strict";

// Claude Code status line:
//   ◆ Opus 5.5 ●●●○○ high │ ctx ▰▰▱▱▱▱▱▱ 23% 230k/1M │ 5h ▰▰▰▱▱▱ 42% ↻ 2h13m │ 7d ▰▱▱▱▱▱ 18%

const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");

let raw = "";
try {
  raw = fs.readFileSync(0, "utf8");
} catch {}

// Set CLAUDE_STATUSLINE_DEBUG=1 to dump the last payload for inspecting field names.
if (process.env.CLAUDE_STATUSLINE_DEBUG) {
  try {
    fs.writeFileSync(path.join(CLAUDE_DIR, "statusline-last.json"), raw);
  } catch {}
}

let data = {};
try {
  data = JSON.parse(raw || "{}");
} catch {}

// ---------- styling ----------
const ESC = "\x1b[";
const RESET = `${ESC}0m`;
const rgb = (r, g, b) => (s) => `${ESC}38;2;${r};${g};${b}m${s}${RESET}`;
const bold = (s) => `${ESC}1m${s}${RESET}`;

const c = {
  claude: rgb(217, 119, 87), // Claude orange
  text: rgb(220, 220, 230),
  dim: rgb(110, 110, 125),
  label: rgb(150, 150, 170),
  green: rgb(120, 200, 120),
  yellow: rgb(230, 190, 90),
  orange: rgb(235, 140, 70),
  red: rgb(235, 90, 90),
  cyan: rgb(110, 190, 220),
};

const SEP = c.dim(" │ ");

const levelColor = (pct) =>
  pct < 50 ? c.green : pct < 75 ? c.yellow : pct < 90 ? c.orange : c.red;

function bar(pct, width) {
  const p = Math.max(0, Math.min(100, pct));
  const filled = Math.round((p / 100) * width);
  return levelColor(p)("▰".repeat(filled)) + c.dim("▱".repeat(width - filled));
}

const fmtPct = (pct) => levelColor(pct)(bold(`${Math.round(pct)}%`));

function fmtTokens(n) {
  if (n >= 1e6) return `${+(n / 1e6).toFixed(n % 1e6 ? 1 : 0)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return `${n}`;
}

function toMs(t) {
  if (t == null) return null;
  if (typeof t === "number") return t < 1e12 ? t * 1000 : t; // seconds or ms
  const ms = Date.parse(t);
  return Number.isNaN(ms) ? null : ms;
}

function fmtDuration(ms) {
  if (ms <= 0) return "now";
  const mins = Math.ceil(ms / 60000);
  const d = Math.floor(mins / 1440);
  const h = Math.floor((mins % 1440) / 60);
  const m = mins % 60;
  if (d) return `${d}d${h}h`;
  if (h) return `${h}h${String(m).padStart(2, "0")}m`;
  return `${m}m`;
}

// ---------- model ----------
const modelId = (data.model && data.model.id) || "";
// "(1M context)" is redundant with the ctx segment.
const modelName = ((data.model && data.model.display_name) || "Claude")
  .replace(/\s*\([^)]*context\)/i, "");

// ---------- effort ----------
function readEffort() {
  const e = data.effort;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && (e.level || e.value)) return e.level || e.value;
  if (data.model && data.model.effort) return data.model.effort;
  if (process.env.CLAUDE_CODE_EFFORT_LEVEL) return process.env.CLAUDE_CODE_EFFORT_LEVEL;

  // Fall back to settings: per-model override, then global.
  try {
    const s = JSON.parse(
      fs.readFileSync(path.join(CLAUDE_DIR, "settings.json"), "utf8")
    );
    const baseId = modelId.replace(/\[.*\]$/, "");
    const ms = s.modelSettings || {};
    const hit = ms[modelId] || ms[baseId] ||
      Object.entries(ms).find(([k]) => baseId.startsWith(k))?.[1];
    return (hit && hit.effortLevel) || s.effortLevel || null;
  } catch {
    return null;
  }
}

const EFFORT_STEPS = ["low", "medium", "high", "xhigh", "max"];
function fmtEffort(level) {
  if (!level) return null;
  const lv = String(level).toLowerCase();
  const idx = EFFORT_STEPS.indexOf(lv);
  if (idx < 0) return c.label(lv);
  const dots = c.claude("●".repeat(idx + 1)) + c.dim("○".repeat(EFFORT_STEPS.length - idx - 1));
  return `${dots} ${c.label(lv)}`;
}

// ---------- context window ----------
function contextSegment() {
  const cw = data.context_window || {};
  const size = cw.context_window_size || (/\[1m\]/i.test(modelId) ? 1e6 : 2e5);
  let pct = typeof cw.used_percentage === "number" ? cw.used_percentage : null;
  let used = null;

  const cu = cw.current_usage;
  if (cu && typeof cu === "object") {
    used = (cu.input_tokens || 0) + (cu.cache_creation_input_tokens || 0) +
      (cu.cache_read_input_tokens || 0) + (cu.output_tokens || 0);
  }
  if (pct == null && used != null) pct = (used / size) * 100;
  if (used == null && pct != null) used = Math.round((pct / 100) * size);
  if (pct == null) return `${c.label("ctx")} ${bar(0, 8)} ${c.dim(`—/${fmtTokens(size)}`)}`;

  return `${c.label("ctx")} ${bar(pct, 8)} ${fmtPct(pct)} ${c.dim(`${fmtTokens(used)}/${fmtTokens(size)}`)}`;
}

// ---------- rate limits ----------
function limitSegment(label, lim, showReset) {
  if (!lim || typeof lim.used_percentage !== "number") return null;
  let s = `${c.label(label)} ${bar(lim.used_percentage, 6)} ${fmtPct(lim.used_percentage)}`;
  const resetMs = toMs(lim.resets_at);
  if (showReset && resetMs) s += ` ${c.cyan(`↻ ${fmtDuration(resetMs - Date.now())}`)}`;
  return s;
}

const rl = data.rate_limits || {};

// ---------- assemble ----------
const head = [c.claude("◆ ") + bold(c.text(modelName)), fmtEffort(readEffort())]
  .filter(Boolean)
  .join(" ");

const parts = [
  head,
  contextSegment(),
  limitSegment("5h", rl.five_hour, true),
  limitSegment("7d", rl.seven_day, false),
].filter(Boolean);

process.stdout.write(parts.join(SEP));
