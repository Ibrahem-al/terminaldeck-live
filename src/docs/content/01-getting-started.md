# Getting started

## What you need

- Windows 10 or 11, 64-bit.
- The Microsoft Edge **WebView2** runtime. Windows 11 already has it. On Windows 10 the installer fetches it if it’s missing, which needs an internet connection.
- To use agents: **Claude Code** and/or **Codex** installed so that `claude` or `codex` runs from a terminal. TerminalDeck doesn’t install them for you.

## Download

Download `TerminalDeck-Setup.exe` from the website, or from the project’s GitHub Releases page. The installer is about 6.5 MB.

## Install

1. Run `TerminalDeck-Setup.exe`.
2. **Windows SmartScreen may warn you.** The installer isn’t Authenticode-signed yet, so Windows may show “Windows protected your PC”. Click **More info**, then **Run anyway**. (Updates you install from inside the app *are* signed and checked. See [Updates, data and privacy](11-updates-privacy.md).)
3. The installer is per-user, so it doesn’t ask for administrator rights. It installs to `%LOCALAPPDATA%\TerminalDeck` by default. The directory page lets you choose another folder.
4. The last page has a checkbox for a desktop shortcut, ticked by default.

Your settings, projects and saved session are stored separately, in `%APPDATA%\quarterdeck`. Updating or reinstalling keeps them.

> **Coming from an older Electron build?** The installer finds the old install, installs over it in the same place, and offers to remove the old version first. Your data carries over.

## First launch

TerminalDeck opens a 1440×900 window with its own title bar. You’ll see:

- **The top bar.** From left to right: the project pill (“No project” until you open one), your deck tabs and a **+** button, then the new-window, black-out and settings buttons, and the window controls.
- **The sidebar** on the left. It shows “No folder open” until you open a folder. Toggle it with **Ctrl+B**.
- **One deck** with a single PowerShell terminal. PowerShell is the default shell, and you can change it in **Settings → General → Default shell**.
- **The notch**: a thin pill at the top centre of your screen, outside the app window. It’s on by default. See [The notch](03-the-notch.md).

On later launches TerminalDeck restores your last session: the same decks, layouts and panes, each terminal opened in the folder it was last in. To start with one fresh terminal instead, set **Settings → General → On startup** to **Start empty**.

## Start an agent in a pane

Click into a terminal pane and type `claude` or `codex` as you would anywhere else. Or:

- **Ctrl+Enter** types `claude` and presses Enter in the active terminal pane.
- Right-click a folder in the sidebar and choose **Open Claude Code Here**. This splits the active pane, starts a terminal in that folder with a “Claude Code” badge, and runs `claude` in it.

When you start `claude` or `codex` in a TerminalDeck terminal, it automatically gets TerminalDeck’s **deck tools**. These let it see the other panes and message other agents (see [Agents working together](04-agents-working-together.md)). The tools are only added inside TerminalDeck. Running `claude` or `codex` anywhere else is unaffected.

## Recommended next steps

1. **Install the Claude Code hooks.** Go to **Settings → Notch** and click **Install hooks**. The notch then knows exactly when Claude asks a question or finishes a turn, instead of guessing. Only `claude` sessions started after you install get the hooks.
2. **Open a second pane.** Press **Ctrl+D** to split right, or **Ctrl+Shift+D** to split down.
3. **Make a project** (**Ctrl+Shift+N**) for a folder you work in often. A project remembers the folder, shell, layout, environment variables and start-up commands. See [Files, editor and projects](05-files-editor-projects.md).
4. **Pick a theme** in **Settings → Themes**. Hovering over a theme previews it across the whole app.
