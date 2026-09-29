#!/usr/bin/env node
"use strict";

// Installs the status line into the Claude Code config dir and points
// settings.json at it. Safe to re-run (used for updates too).
//
//   node install.js

const fs = require("fs");
const os = require("os");
const path = require("path");

const CLAUDE_DIR = process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), ".claude");
const SRC = path.join(__dirname, "statusline-command.js");
const DEST = path.join(CLAUDE_DIR, "statusline-command.js");
const SETTINGS = path.join(CLAUDE_DIR, "settings.json");

fs.mkdirSync(CLAUDE_DIR, { recursive: true });
fs.copyFileSync(SRC, DEST);
console.log(`Copied script   -> ${DEST}`);

let settings = {};
let original = null;
if (fs.existsSync(SETTINGS)) {
  original = fs.readFileSync(SETTINGS, "utf8");
  try {
    settings = JSON.parse(original);
  } catch (err) {
    console.error(`Could not parse ${SETTINGS}: ${err.message}`);
    console.error("Fix the file (or add the statusLine entry by hand) and re-run.");
    process.exit(1);
  }
}

// Forward slashes + quotes: Claude Code runs this through Git Bash on Windows,
// where backslashes are eaten as escape characters.
const command = `node "${DEST.replace(/\\/g, "/")}"`;
const statusLine = { type: "command", command };

if (JSON.stringify(settings.statusLine) === JSON.stringify(statusLine)) {
  console.log(`Settings        -> already configured (${SETTINGS})`);
} else {
  if (original !== null) {
    const backup = `${SETTINGS}.bak-${Date.now()}`;
    fs.writeFileSync(backup, original);
    console.log(`Backed up       -> ${backup}`);
  }
  if (settings.statusLine) {
    console.log(`Replacing old   -> ${JSON.stringify(settings.statusLine)}`);
  }
  settings.statusLine = statusLine;
  fs.writeFileSync(SETTINGS, JSON.stringify(settings, null, 2) + "\n");
  console.log(`Updated         -> ${SETTINGS}`);
}

console.log(`Command         -> ${command}`);
console.log("Done. The status line appears on the next message (restart Claude Code if not).");
