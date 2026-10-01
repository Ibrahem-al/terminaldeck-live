# Keyboard shortcuts

**Settings → Shortcuts** has a reference list you can check inside the app. This page is the complete set.

## App-wide

These work anywhere in a TerminalDeck window, including inside terminals. They’re caught before the shell sees them (see [the note at the end](#keys-the-app-keeps)).

| Keys | Action |
|---|---|
| Ctrl+T | New deck (opens the template picker) |
| Ctrl+W | Close the current deck |
| Ctrl+Tab / Ctrl+Shift+Tab | Next / previous deck (includes the Settings deck when it’s open) |
| Ctrl+1 … Ctrl+9 | Go to deck 1–9 |
| Ctrl+D | Split the active pane right (new terminal) |
| Ctrl+Shift+D | Split the active pane down (new terminal) |
| Ctrl+Enter | Launch Claude Code in the active pane (types `claude` and presses Enter) |
| Ctrl+Shift+M | Open a new window |
| Ctrl+P | Quick Open (search files by name) |
| Ctrl+K | Project switcher |
| Ctrl+Shift+N | New project |
| Ctrl+B | Show / hide the sidebar |
| Ctrl+Shift+F | Search files in the sidebar |
| Ctrl+Shift+E | Focus the file browser |
| Ctrl+Shift+. | Show / hide hidden files |
| Ctrl+Shift+X | Show / hide the Messages drawer |
| Ctrl+Shift+B | Black out the screen now |
| Ctrl+, | Open Settings |

## Moving between panes (no prefix)

These need **Settings → Shortcuts → Direct pane navigation**, which is on by default. They don’t work inside the code editor, which uses Alt itself.

| Keys | Action |
|---|---|
| Alt+← / → / ↑ / ↓ | Focus the pane in that direction |
| Alt+[ / Alt+] | Focus the previous / next pane |
| Alt+Shift+← / → / ↑ / ↓ | Swap the active pane with its neighbour in that direction |

## tmux prefix keys

Press the **prefix** (**Ctrl+A** by default), let go, then press a command key within 3 seconds. A hint bar at the bottom of the window shows while the prefix is armed. To change the prefix to **Ctrl+Space** or **Alt+Q**, or to turn prefix mode off, go to **Settings → Shortcuts**.

The prefix only arms from a terminal or the app itself. In a text field or the code editor, Ctrl+A keeps its normal meaning (select all).

| After the prefix | Action |
|---|---|
| ← ↑ ↓ → or h j k l | Move to the pane in that direction |
| o | Next pane |
| ; | Last pane (the one you were in before) |
| % | Split right |
| " | Split down |
| x | Close the active pane |
| z | Zoom / unzoom the active pane |
| { / } | Swap with the previous / next pane |
| ! | Move the active pane out into a new deck |
| c | New deck (Single, no dialog) |
| n / p | Next / previous deck |
| 1 – 9 | Go to deck 1–9 |
| & | Close the current deck |
| q | Show pane numbers. Press a digit within 3 seconds to jump to that pane. |
| m | Show / hide the Messages drawer |
| ? | Open Settings |

## In a terminal

| Keys | Action |
|---|---|
| Ctrl+C | Copy the selection. With nothing selected, it interrupts the running program. |
| Ctrl+V | Paste |
| Ctrl+Shift+C | Copy (never interrupts) |
| Ctrl+Shift+V | Paste |
| Alt+click | Move the prompt cursor to where you click (the default; see Settings → Terminal → Click to move cursor) |
| Shift+drag | Select text, even inside full-screen apps |
| Ctrl+click | Open a link in your browser |
| Ctrl+F | Search the terminal’s output |
| Enter / Shift+Enter | Next / previous match (while searching) |
| Esc | Close search |

Each copy and paste shortcut can be switched off in **Settings → Terminal**.

## In the editor

| Keys | Action |
|---|---|
| Ctrl+S | Save (formats first if Format on save is on) |
| Ctrl+F | Find |
| Ctrl+H | Find and replace |
| Middle-click a tab | Close that file |

The editor’s own shortcuts (Monaco, the same as VS Code) work as usual.

## In the file tree

| Keys | Action |
|---|---|
| ↑ / ↓, Home / End, Page Up / Page Down | Move |
| → / ← | Expand / collapse, or step into a folder / go to its parent |
| Enter | Open the file, or toggle the folder |
| F2 | Rename |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste |

## In the notch

| Keys | Action |
|---|---|
| Esc | Collapse the pulldown |
| Shift+Esc | Collapse the pulldown, even while typing in its mini terminal |

## Elsewhere

- **Dialogs.** Enter confirms and Esc cancels.
- **Switchers** (Quick Open, projects). ↑ / ↓ and Enter to pick, Esc to close.
- **Deck tabs.** Focus a tab, then Enter or Space to open it.
- **Dividers between panes.** Tab to one, then use the arrow keys to move it.
- **Settings deck.** Esc closes it.

## Keys the app keeps

The app-wide shortcuts above are caught first, so they never reach the program running in a terminal. The ones most likely to matter in a shell are **Ctrl+D**, **Ctrl+W**, **Ctrl+T**, **Ctrl+P**, **Ctrl+K** and **Ctrl+B**, plus the prefix key (**Ctrl+A** by default). For example, Ctrl+D splits the pane instead of sending end-of-file, and Ctrl+A arms the prefix instead of moving to the start of the line. If you rely on Ctrl+A in your shell or editor, change the prefix to **Ctrl+Space** or **Alt+Q**.
