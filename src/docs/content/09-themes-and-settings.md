# Themes and settings

## Themes

TerminalDeck has nine themes, all designed from scratch. Each one colours the whole app: the interface, the terminals (with a full 16-colour palette) and the editor. Light themes have their own terminal colours rather than inverted dark ones.

| Theme | Kind | In one line |
|---|---|---|
| **Deepwater** (default) | Dark | The bridge of a ship at night — ink and brass |
| Midnight Slate | Dark | Deep cool gray, blue undertones, no noise |
| Ember | Dark | Firelight in a dark room |
| Ghost | Light | Near-white surfaces, dark text — not a light mode |
| Obsidian Sharp | Dark | Pure black, electric accents, maximum contrast |
| Daylight | Light | Clean, bright, built for daytime work |
| Parchment | Light | Warm sepia for long sessions |
| Verdigris | Dark | Sea-green patina on old ship bronze |
| Abyssal | Dark | Hadal black-blue lit by bioluminescence |

In **Settings → Themes**, **hover over a theme to preview it across the whole app**, then click to apply it.

## The Settings deck

Open Settings with **Ctrl+,**, the gear button in the top bar, or **Prefix ?**. It opens as its own tab in the deck strip, so your terminals keep running beside it and **Ctrl+Tab** switches between them. Close it with **Esc**, its ✕, or **Save**.

**Changes apply live and save automatically.** The **Save** button just makes sure everything is written, then closes Settings.

Settings has 14 sections: General, Editor, Terminal, Pane names, Deck tools, Power, Notch, Blackout, Phone, Shortcuts, Themes, Projects, Updates and About. Every setting is listed below with its default.

### General

| Setting | Default | Effect |
|---|---|---|
| Default shell | PowerShell | The shell for new panes when no project is open. Lists the shells installed on your PC. |
| Default workspace template | Single | Preselected when you create a new deck (Single, Split, Quad, Six, Eight) |
| On startup | Restore last session | **Restore last session** brings back your decks and panes. **Start empty** starts with a fresh terminal. |
| Default directory | (home) | Where new terminals and the folder picker start. Type a path or use **Browse**. Empty means your home folder. |
| Sidebar side | Left | Dock the file browser on the left or right |
| Keep computer awake while agents are working | Off | Keeps the PC from sleeping while a terminal is busy. The display can still sleep. On battery it does nothing unless **Power → Keep the PC awake on battery** is on. |
| Confirm before closing a window | On | Warns before closing a window that still has live terminals, agents or unsaved files. Empty windows close without asking. |
| Confirm before closing a deck | On | Asks before a deck closes, from its ✕, the right-click menu, **Ctrl+W** or **Prefix &**, including when you close its last pane. Pinned panes still block the close outright. |
| Confirm before closing a pane | Off | Asks before a single pane closes, from its ✕, the pane menu, the hidden-panes list or **Prefix x** |

### Editor

| Setting | Default | Effect |
|---|---|---|
| Font size | 13 | Editor text size (9–28) |
| Tab size | 2 spaces | 2, 4 or 8 spaces |
| Word wrap | Off | Wrap long lines. Each editor pane can override this with its own button. |
| Minimap | On | Show the code overview strip. Each editor pane can override this. |
| Format on save | Off | Runs the language formatter before writing (JSON, CSS, HTML, TS…) |

### Terminal

| Setting | Default | Effect |
|---|---|---|
| Font size | 13 | Terminal text size (9–24). Applies live to every open terminal. |
| Scrollback | 10,000 lines | Lines kept in each terminal’s history: 1,000 / 5,000 / 10,000 / 25,000 / 50,000 / 100,000 lines, or Infinite, which grows with output |
| Cursor style | Bar | Bar, Block or Underline |
| Cursor blink | On | |
| Bell sound | Off | A quiet blip when a program rings the terminal bell |
| Show history after restart | Off | Restored panes offer a read-only view of what they showed before the app restarted. The Resume conversation offer appears either way. |
| **Clipboard shortcuts** | | |
| Ctrl+C copies selection | On | Copies when text is selected, and sends an interrupt otherwise |
| Ctrl+V pastes | On | |
| Ctrl+Shift+C copies | On | A dedicated copy that never interrupts the running program |
| Ctrl+Shift+V pastes | On | |
| Copy on select | On | Selecting text copies it to the clipboard automatically |
| Select text in full-screen apps | On | A plain mouse drag selects text even in apps that grab the mouse (Claude Code, vim). While it’s on, a plain click doesn’t reach those apps. Shift+drag always selects. |
| **Editing** | | |
| Click to move cursor | Alt + click | **Off**, **Alt + click** or **Click**. Moves the prompt cursor to where you click. |
| Type over selection | On | Highlight text in the prompt, then type or press Backspace to replace or delete it |

### Pane names

| Setting | Default | Effect |
|---|---|---|
| Name panes after what they’re doing | Auto — title or command | **Off — keep the names I gave them**, **Auto — title or command**, or **Smart — Auto plus Claude summaries**. A name you type yourself always wins. |
| Include the folder | On | Adds the working folder, e.g. “cargo build · rust_app” |
| Summarize every | 120 seconds | *Smart only.* Seconds between summaries for each busy pane (30–3600). Idle panes cost nothing. |
| Model | haiku | *Smart only.* Passed straight to `claude -p --model`. |

Smart mode spends tokens on your Claude account. Auto mode never calls out.

### Deck tools

The rows under the first one appear only while it’s on.

| Setting | Default | Effect |
|---|---|---|
| Let agents work with the other panes | On | Gives Claude Code and Codex in your terminals tools to list, read and type into other panes, and to message each other. A pane is read only when a tool asks for it. |
| Hand the tools to claude in terminals | On | Wraps `claude` in terminal panes so one you type yourself gets the tools. New terminals pick up a change. |
| Hand the tools to codex in terminals | On | Wraps `codex` the same way, as one-run config overrides. Nothing is written to `~/.codex`. New terminals pick up a change. |
| Allow sending to panes | On | Lets an agent type a line into another pane’s shell, but never its own pane, a busy pane, or a recognised agent. Off: agents can read but not type. |
| Let agents message each other | On (follows Allow sending to panes until you set it) | Allows `send_message` between Claude Code and Codex agents |
| Also message agents running without approvals | Off | Allows messages to agents started with approval-bypass flags, or showing “bypass permissions on” |
| Animate messages between panes | On | A small packet flies from sender to receiver. With reduced motion, you see a brief ring instead. |
| Context limit | 12,000 | The most characters one read may return (2,000–60,000, in steps of 1,000) |

See [Agents working together](04-agents-working-together.md).

### Power

| Setting | Default | Effect |
|---|---|---|
| Keep the PC awake on battery | Off | Lets the keep-awake setting hold the PC awake on battery too |
| Efficiency mode for the app’s browser processes when not in front | On battery | **Off**, **On battery** or **Always**. Runs TerminalDeck’s own interface on the efficient cores while it isn’t focused. Terminals are never throttled. |

### Notch

| Setting | Default | Effect |
|---|---|---|
| Enable the notch | On | The always-on-top pill for agent questions and finished work |
| Pill visibility | Always visible | Or **Hidden until needed**: it appears for alerts, or when you park the mouse at the top-centre screen edge |
| Size | Normal | Small, Normal, Large or Extra large |
| Show while TerminalDeck is focused | On | Off: alerts only appear while you’re in other apps |
| Auto-focus questions | On | A new question takes the keyboard when you’re not mid-typing |
| Turn finished | On | Alert when an agent finishes a turn and is waiting for you |
| Command finished | On | Alert when a long shell command completes |
| Minimum command time | 15 | Seconds a command must run before it gets a “finished” alert (1–3600) |
| Waiting-detection heuristics | On | Best-effort “may be waiting for you” hints (screen content, bell, OSC 9) for CLIs without hooks |
| Desktop notification on task finish | Off | A Windows notification when a long command finishes |
| Minimum task time | 20 | *Shown when desktop notifications are on.* Seconds a task must run to notify (0–3600). |
| Claude Code hooks — exact detection | Not installed | **Install hooks** / **Remove hooks**. See [The notch](03-the-notch.md). |

### Blackout

| Setting | Default | Effect |
|---|---|---|
| Black out the screen when you’re away | Off | Covers every monitor with black after a stretch with no input |
| Wait for | 5 minutes | 1, 2, 5, 10, 15 or 30 minutes |
| Only while agents are working | Off | Only black out while a terminal is still producing output |
| Only while TerminalDeck is in front | On | Only black out when you went idle in TerminalDeck |
| Wake when an agent has a question | On | Lifts the blackout when an agent asks for permission |
| Stay awake for | 1 minute | How long such a wake lasts: 15 seconds, 30 seconds, 1 minute, 3 minutes or 10 minutes |
| Top bar button | On | Shows the black-out-now button. Ctrl+Shift+B works either way. |

### Phone

| Setting | Default | Effect |
|---|---|---|
| Phone access | Off | Control your terminals from the T3 Code app on your phone |
| Phone connects through | Automatic | The network address used in pairing links |
| Port | 8792 | 1024–65535. Changing it means pairing phones again. |

The rows under **Phone access** appear only while it’s on, along with a **Status** line. The **Windows Firewall** badge (with **Allow**) and **Pair a phone** appear once the server is running. See [Your phone](08-phone.md).

### Shortcuts

| Setting | Default | Effect |
|---|---|---|
| Direct pane navigation | On | **Alt+Arrow** moves focus, **Alt+[** / **Alt+]** cycle panes, and **Alt+Shift+Arrow** swaps. These keys are ignored inside the code editor, which uses Alt itself. |
| tmux prefix mode | On | Press the prefix, then a command key. A hint shows while the prefix is armed. |
| Prefix key | Ctrl+A | **Ctrl+A**, **Ctrl+Space** or **Alt+Q**. It’s captured from terminals, so it overrides that key there. |

Below these is the **All shortcuts** reference list. See [Keyboard shortcuts](10-shortcuts.md).

### Themes

The theme grid. Hover to preview, click to apply.

### Projects

Your projects, with ✎ Edit and 🗑 Delete, and a **New project** button. See [Files, editor and projects](05-files-editor-projects.md).

### Updates

Your version, **Check for updates**, and the update’s progress. See [Updates, data and privacy](11-updates-privacy.md).

### About

The app name and version.
