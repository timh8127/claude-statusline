#!/usr/bin/env node
"use strict";

// Claude Code status line:
//   ◆ Opus 5.5 ●●●○○ high │ ctx ▰▰▱▱▱▱▱▱ 23% 230k/1M │ cache ▰▰▰▱ 4m05s │ 5h ▰▰▰▱▱▱ 42% ↻ 2h13m │ 7d ▰▱▱▱▱▱ 18%
//
// Shrinks to fit the terminal width (COLUMNS, which Claude Code sets), dropping
// the least useful detail first. See SHRINK_STEPS.

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

// Join non-empty pieces with a space.
const join = (...xs) => xs.filter(Boolean).join(" ");

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
const effortLevel = readEffort();

function effortSegment(o) {
  if (!effortLevel || !o.effort) return null;
  const lv = String(effortLevel).toLowerCase();
  const idx = EFFORT_STEPS.indexOf(lv);
  if (idx < 0) return c.label(lv);
  const dots = c.claude("●".repeat(idx + 1)) + c.dim("○".repeat(EFFORT_STEPS.length - idx - 1));
  return join(dots, o.effortLabel && c.label(lv));
}

function headSegment(o) {
  return join(c.claude("◆ ") + bold(c.text(modelName)), effortSegment(o));
}

// ---------- context window ----------
function contextSegment(o) {
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

  const label = c.label("ctx");
  if (pct == null) {
    return join(label, o.bars && bar(0, o.shortBars ? 4 : 8), c.dim(o.tokens ? `—/${fmtTokens(size)}` : "—"));
  }
  return join(label, o.bars && bar(pct, o.shortBars ? 4 : 8), fmtPct(pct),
    o.tokens && c.dim(`${fmtTokens(used)}/${fmtTokens(size)}`));
}

// ---------- prompt cache ----------
// Uses the `prompt_cache` object Claude Code (v2.1.251+) passes in. The bar drains
// as the cached prefix approaches its TTL; once cold, shows how many tokens the
// next message will have to re-write. Warmth is recomputed from `expires_at`
// on every run, so the countdown stays honest between messages (see
// `refreshInterval` in install.js).
function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  if (s >= 600) return `${Math.ceil(s / 60)}m`;
  if (s >= 60) return `${Math.floor(s / 60)}m${String(s % 60).padStart(2, "0")}s`;
  return `${s}s`;
}

function cacheSegment(o) {
  const pc = data.prompt_cache;
  if (!pc || typeof pc !== "object" || !pc.caching_observed) return null;

  const label = c.label("cache");
  const ttlMs = pc.ttl === "1h" ? 3600e3 : 300e3;
  const expMs = toMs(pc.expires_at);
  const left = expMs != null ? expMs - Date.now() : null;
  const warm = left != null ? left > 0 : !!pc.warm;

  if (!warm) {
    const rebuild = o.rebuild && pc.recache_tokens_if_cold > 0 &&
      c.dim(`↺ ${fmtTokens(pc.recache_tokens_if_cold)}`);
    return join(label, c.cyan("❄ cold"), rebuild);
  }

  if (left == null) return join(label, c.green("● warm"));

  // Bar shows time remaining; colour goes green → red as the TTL drains.
  const drained = Math.min(100, Math.max(0, 100 - (left / ttlMs) * 100));
  const col = levelColor(drained);
  const w = o.shortBars ? 2 : 4;
  const filled = Math.max(1, Math.round(((100 - drained) / 100) * w));
  const gauge = o.bars && col("▰".repeat(filled)) + c.dim("▱".repeat(w - filled));
  return join(label, gauge, col(bold(fmtClock(left))));
}

// ---------- rate limits ----------
const rl = data.rate_limits || {};

function limitSegment(label, lim, showReset, o) {
  if (!lim || typeof lim.used_percentage !== "number") return null;
  const resetMs = toMs(lim.resets_at);
  const reset = showReset && o.reset && resetMs &&
    c.cyan(`↻ ${fmtDuration(resetMs - Date.now())}`);
  return join(c.label(label), o.bars && bar(lim.used_percentage, o.shortBars ? 3 : 6),
    fmtPct(lim.used_percentage), reset);
}

// ---------- fit to width ----------
// Each step is applied on top of the previous ones until the line fits.
const SHRINK_STEPS = [
  {},                   // everything
  { tokens: false },    // ctx: drop "230k/1M", keep the percentage
  { effortLabel: false }, // effort: dots only
  { shortBars: true },  // halve every bar
  { bars: false },      // no bars: percentages/countdown carry the colour
  { sevenDay: false },  // weekly limit
  { rebuild: false },   // cold cache: drop "↺ 228k"
  { reset: false },     // 5h: drop "↻ 2h13m"
  { effort: false },    // effort dots
];
const FULL = {
  tokens: true, effortLabel: true, bars: true, shortBars: false, sevenDay: true,
  rebuild: true, reset: true, effort: true,
};

function render(o) {
  return [
    headSegment(o),
    contextSegment(o),
    cacheSegment(o),
    limitSegment("5h", rl.five_hour, true, o),
    o.sevenDay && limitSegment("7d", rl.seven_day, false, o),
  ].filter(Boolean).join(SEP);
}

// Visible width: strip colour codes, count code points (all glyphs used are 1 column).
const visibleWidth = (s) => Array.from(s.replace(/\x1b\[[0-9;]*m/g, "")).length;

// CLAUDE_STATUSLINE_WIDTH overrides; otherwise COLUMNS minus a little slack for
// Claude Code's own padding. Unknown width → never shrink.
function budget() {
  const override = parseInt(process.env.CLAUDE_STATUSLINE_WIDTH, 10);
  if (override > 0) return override;
  const cols = parseInt(process.env.COLUMNS, 10);
  return cols > 0 ? cols - 2 : Infinity;
}

const max = budget();
let opts = { ...FULL };
let line = render(opts);
for (const step of SHRINK_STEPS.slice(1)) {
  if (visibleWidth(line) <= max) break;
  opts = { ...opts, ...step };
  line = render(opts);
}

process.stdout.write(line);
