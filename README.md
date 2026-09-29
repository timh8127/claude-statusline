# claude-statusline

A colored status line for [Claude Code](https://claude.com/claude-code):

```
◆ Opus 5.5 ●●●○○ high │ ctx ▰▰▱▱▱▱▱▱ 23% 230k/1M │ 5h ▰▰▰▱▱▱ 42% ↻ 2h13m │ 7d ▰▰▰▰▰▱ 81%
```

| Segment | Shows |
|---|---|
| `◆ Opus 5.5` | Current model |
| `●●●○○ high` | Effort level (low → medium → high → xhigh → max) |
| `ctx` | Context window used: bar, percent, tokens / window size |
| `5h` | 5-hour usage limit, plus time until it resets (`↻`) |
| `7d` | Weekly usage limit |

Bars go green → yellow (50%) → orange (75%) → red (90%). The `5h`/`7d` segments appear once
Claude Code reports rate limits (subscription plans, after the first response).

## Install

Requires Node.js.

```sh
git clone https://github.com/timh8127/claude-statusline.git
cd claude-statusline
node install.js
```

The installer copies `statusline-command.js` into `~/.claude/` (or `$CLAUDE_CONFIG_DIR`) and sets
`statusLine` in `settings.json`, keeping every other setting and saving a timestamped backup first.

**Update:** `git pull && node install.js`

## Notes

- **Windows:** the command must use forward slashes (`node "C:/Users/..."`). Claude Code runs it
  through Git Bash, which treats backslashes as escapes and silently breaks the path. The
  installer handles this.
- **Effort** comes from the status line payload when Claude Code provides it, otherwise from
  `effortLevel` / `modelSettings` in `settings.json`.
- **Debugging:** set `CLAUDE_STATUSLINE_DEBUG=1` to write each raw payload to
  `~/.claude/statusline-last.json`.
- **Test by hand:** `echo '{}' | node ~/.claude/statusline-command.js`
