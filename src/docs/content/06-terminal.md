# The terminal

Every terminal pane is a real Windows console session (ConPTY), running a real shell.

## Shells

TerminalDeck offers whichever of these are installed:

| Shell | Notes |
|---|---|
| PowerShell | The default |
| PowerShell 7 | `pwsh` |
| Command Prompt | `cmd.exe`. It works as a terminal, but see below. |
| Git Bash | From Git for Windows |

Set the default in **Settings → General → Default shell**. A project can set its own. To open a different shell in one pane, use **Split options** in the pane header.

**Why PowerShell and Git Bash get more features.** TerminalDeck loads a small integration script into PowerShell, PowerShell 7 and Git Bash. The script lets the shell report when a command starts and ends, its exit code and the current folder. That’s what drives command-finished alerts, the live folder in the pane header, pane names taken from the command, and agent messaging. **Command Prompt has no integration**, so those features don’t work in cmd panes.

You can start typing as soon as a pane opens. Anything you type before the shell’s first prompt is held and sent once the shell is ready. Ctrl+C at that point cancels the held input.

## Copy and paste

| Setting (Settings → Terminal) | Default | What it does |
|---|---|---|
| Ctrl+C copies selection | On | Copies when text is selected. With nothing selected, Ctrl+C interrupts the running program as usual. |
| Ctrl+V pastes | On | |
| Ctrl+Shift+C copies | On | Copies, and never interrupts the running program |
| Ctrl+Shift+V pastes | On | |
| Copy on select | On | Selecting text copies it straight away. This helps in apps like Claude Code that redraw and clear your selection before you can press Ctrl+C. |

The terminal’s right-click menu has **Copy**, **Paste**, **Reload display** and **Clear terminal**.

## Using the mouse

**Click to move cursor** (Settings → Terminal). Reposition the cursor in the prompt line by clicking:

| Option | Behaviour |
|---|---|
| Off | Clicking never moves the cursor |
| **Alt + click** (default) | Alt+click moves the cursor. A plain click is left free for selecting. |
| Click | A plain click moves the cursor, like a text editor |

Full-screen apps such as `claude` and `vim` handle the mouse themselves.

**Type over selection** (on by default). Highlight text in the prompt, then type to replace it or press Backspace to delete it.

**Select text in full-screen apps** (on by default). Apps like Claude Code and vim take over the mouse, which normally stops you from selecting text. With this on, a plain drag selects text anyway, and dragging past the top or bottom edge scrolls. The trade-off: a plain click doesn’t reach those apps. Turn it off if you need to click inside them. **Shift+drag** always selects, whatever the setting.

## Links

**Ctrl+click** a web address in a terminal to open it in your browser. This includes labelled links, such as the ones Codex prints. A plain click never opens a link, so you can still select text.

## Search

Press **Ctrl+F** in a terminal to search its output. Type to search, then **Enter** for the next match, **Shift+Enter** for the previous one, and **Esc** to close. The counter shows which match you’re on. Ctrl+F isn’t available while a full-screen app is on screen, because the app gets the key.

## Dropping files

Drag files from Explorer, the desktop or TerminalDeck’s own sidebar onto a terminal. While you drag, it shows “Drop to insert path”. When you drop, the paths are typed at the prompt, with quotes where needed. They aren’t run: press Enter yourself.

## Reload display

If a terminal ever looks garbled, blank or wrongly sized, click **Reload terminal display** (the circular-arrow button in the pane header), or right-click → **Reload display**. It re-fits and repaints the terminal. Your scrollback and anything you’ve typed but not yet run are kept, and the program inside keeps running.

## Scrollback

**Settings → Terminal → Scrollback** sets how many lines each terminal keeps: 1,000, 5,000, **10,000** (default), 25,000, 50,000 or 100,000 lines, or **Infinite**. Infinite keeps growing with output, so it uses more memory over time.

## Font, cursor and bell

| Setting | Default | Options |
|---|---|---|
| Font size | 13 | 9–24. Applies live to every open terminal. |
| Cursor style | Bar | Bar, Block, Underline |
| Cursor blink | On | |
| Bell sound | Off | A quiet blip when a program rings the terminal bell |

Terminals use IBM Plex Mono, and their colours follow your app theme.

## Keys the app keeps for itself

Some app shortcuts are caught before the shell sees them, even when a terminal has focus: **Ctrl+D**, **Ctrl+W**, **Ctrl+T**, **Ctrl+P**, **Ctrl+K** and **Ctrl+B**. For example, Ctrl+D splits the pane rather than sending end-of-file. The tmux prefix (**Ctrl+A** by default) is caught too, so Ctrl+A doesn’t move to the start of the line. If that gets in your way, switch the prefix to **Ctrl+Space** or **Alt+Q**, or turn prefix mode off, in **Settings → Shortcuts**.
