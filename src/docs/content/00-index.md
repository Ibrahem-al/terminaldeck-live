# TerminalDeck user guide

TerminalDeck is a Windows app for running several AI coding agents side by side. It gives you real terminals (PowerShell, PowerShell 7, Command Prompt and Git Bash) tiled into tabs called **decks**, plus a code editor and a file browser. On top of that it adds the things you need when agents are doing the typing:

- **The notch.** A small pill at the top of the screen that lights up when an agent asks a question or finishes, so you can answer it without switching windows.
- **Deck tools.** Claude Code and Codex running in your panes can see the other panes, and can send each other messages.
- **Panes that name themselves**, so every pane header tells you what that pane is doing.
- **Blackout and keep-awake**, so you can walk away while agents keep working.
- **Phone access** through the T3 Code mobile app. It’s optional and off by default.

Everything runs on your own PC. TerminalDeck has no account, no cloud service and no telemetry.

This guide covers **TerminalDeck v0.3.9** on Windows 10 and 11.

## Chapters

| # | Chapter | What’s in it |
|---|---|---|
| 1 | [Getting started](01-getting-started.md) | Download, install, first launch, starting Claude Code or Codex in a pane |
| 2 | [Decks and panes](02-decks-and-panes.md) | Templates, splitting, swapping, zoom, hide, pin, badges, pane names, windows, restarts |
| 3 | [The notch](03-the-notch.md) | Alerts, the mini terminal, Claude Code hooks, desktop notifications |
| 4 | [Agents working together](04-agents-working-together.md) | Deck tools, agent-to-agent messages, the Messages drawer, safety limits |
| 5 | [Files, editor and projects](05-files-editor-projects.md) | Sidebar, drag and drop, the built-in editor, Quick Open, projects |
| 6 | [The terminal](06-terminal.md) | Shells, copy and paste, the mouse, search, links, scrollback |
| 7 | [Walking away](07-walk-away.md) | Blackout, keep-awake, battery and efficiency settings |
| 8 | [Your phone](08-phone.md) | Pairing the T3 Code app over Wi-Fi or Tailscale |
| 9 | [Themes and settings](09-themes-and-settings.md) | The nine themes and every setting, with its default |
| 10 | [Keyboard shortcuts](10-shortcuts.md) | Every shortcut, including the tmux prefix keys |
| 11 | [Updates, data and privacy](11-updates-privacy.md) | Signed updates, where your data lives, uninstalling |
| 12 | [Troubleshooting](12-troubleshooting.md) | Common problems and how to fix them |

## A few words this guide uses

| Word | Meaning |
|---|---|
| **Deck** | A workspace tab. Each deck has its own tiled layout of up to 16 panes. |
| **Pane** | One tile in a deck: a terminal or an editor. |
| **Agent** | A command-line coding assistant running in a terminal pane. TerminalDeck recognises **Claude Code** (`claude`) and **Codex** (`codex`). Other CLIs run fine; they just don’t get the agent-specific features. |
| **Prefix** | The tmux-style prefix key, **Ctrl+A** by default. You press it, then a command key. |
| **Settings deck** | Settings opens as its own tab in the deck strip, not as a separate window. Open it with **Ctrl+,**. |
