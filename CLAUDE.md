# Instructions for agents

If the user asked you to install (or update) this status line, do exactly this:

1. Confirm Node.js is available: `node --version`. If it is missing, stop and tell the user.
2. From the repo root, run: `node install.js`
   - It copies `statusline-command.js` into the Claude config dir (`$CLAUDE_CONFIG_DIR` or `~/.claude`)
     and sets `statusLine` in `settings.json`. Other settings are preserved; a backup
     (`settings.json.bak-<timestamp>`) is written before any change.
   - If it reports that `settings.json` could not be parsed, do not overwrite the file. Show the
     user the error and ask how to proceed.
3. Verify it renders by piping sample input through the installed copy, using the exact
   `Command` the installer printed:
   `echo '{}' | <command>` — it should print a line starting with `◆ Claude`, exit code 0.
   On Windows, run this through bash (Git Bash), since that is how Claude Code invokes it.
4. Tell the user the status line appears after their next message, or after restarting Claude Code.

Do not edit `statusLine` in `settings.json` by hand with a backslash path — on Windows Claude Code
runs the command through Git Bash, which strips the backslashes and the status line silently
disappears. `install.js` writes a forward-slash, quoted path for this reason.

To update an existing install: `git pull`, then `node install.js` again.
