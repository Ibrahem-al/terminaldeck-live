# Files, editor and projects

## The sidebar

The sidebar is a file browser for one folder at a time.

- **Show or hide it** with **Ctrl+B**.
- **Open a folder** with the folder button in its header. The picker starts in **Settings → General → Default directory**.
- **Dock it left or right** with the header’s dock button, or with **Settings → General → Sidebar side**. Drag its edge to resize it (180–420 px).
- **Hidden files** (names starting with “.”) are off by default. Toggle them with **Ctrl+Shift+.** or the eye button.
- The tree updates live as files change on disk, including when an agent creates or edits them.

Header buttons: **New file**, **New folder**, show/hide hidden files, **Open folder**, dock left/right, and **Hide sidebar**.

### Searching

- **Ctrl+Shift+F** shows the sidebar and puts you in **Search files…**. It matches file names (not contents), ignoring case. Click a result to select it, double-click to open it in the editor, or drag it into a terminal. Esc clears the search.
- Search skips `node_modules`, `dist`, `.git`, `.next`, `.cache`, `__pycache__`, `.venv`, `out` and `.vite`, and shows at most 300 results.

### Moving around the tree with the keyboard

**Ctrl+Shift+E** focuses the tree. Then:

| Key | Action |
|---|---|
| ↑ / ↓, Home / End, Page Up / Page Down | Move |
| → | Expand a folder, or step into it |
| ← | Collapse a folder, or go to its parent |
| Enter | Open a file, or toggle a folder |
| F2 | Rename |
| Ctrl+C / Ctrl+X / Ctrl+V | Copy / cut / paste |

There’s no Delete-key shortcut. Delete from the right-click menu.

### Right-click menu

| Item | On | What it does |
|---|---|---|
| Open Terminal Here | Folders | Splits the active pane with a new terminal in that folder |
| Open Claude Code Here | Folders | Splits the active pane with a terminal in that folder, badged “Claude Code”, and runs `claude` |
| New File / New Folder | Folders | Creates one inside the folder |
| Cut / Copy / Paste | Both | **Copy** also puts the file on the Windows clipboard, so you can paste it in Explorer. **Paste** also accepts files copied in Explorer, or an image. |
| Rename | Both | Rename in place (also **F2**) |
| Delete | Both | Moves the item to the **Recycle Bin**, without asking first |
| Copy Path / Copy Relative Path | Both | Copies the path as text |
| Reveal in Explorer | Both | Opens Windows Explorer at the item |

### Drag and drop

| Drag… | …onto | Result |
|---|---|---|
| A file from the tree or search results | A terminal | Types the file’s path at the prompt, in quotes if it contains spaces (“Drop to insert path”) |
| Files from Explorer or the desktop | A terminal | Types their paths, separated by spaces and quoted where needed |
| A file in the tree | Another folder in the tree | Moves it |
| Files from Explorer or the desktop | A folder in the tree | Copies them in |
| A link from your browser | A folder in the tree | Downloads it into that folder |
| An image from your browser | A folder in the tree | Saves it as `pasted-image-<time>.png` (or .jpg, .gif, .webp, .svg) |
| A file in the tree | Explorer or the desktop | Copies it out |

## The editor

TerminalDeck has a built-in code editor (Monaco, the editor inside VS Code) that tiles alongside your terminals.

- **Open a file** by double-clicking it in the sidebar, or press **Ctrl+P** for **Quick Open** (see below).
- A file opens in the active pane if it’s an editor, otherwise in the first editor pane in the deck. If the deck has no editor pane yet, TerminalDeck splits the active pane to the right to make one.
- **Open an editor pane directly** with **Split options** → **Editor** in any pane header.
- Each editor pane has its own row of file tabs. A dot on a tab means unsaved changes. Middle-click a tab to close it.
- **Ctrl+S** saves. If **Format on save** is on, the file is formatted first.
- **Ctrl+F** finds and **Ctrl+H** finds and replaces, the same as in VS Code.
- The **Toggle minimap** and **Toggle word wrap** buttons at the right of the tab row change those for that pane only. The defaults are in **Settings → Editor**.
- The editor follows your app theme.

**When a file changes on disk** (for example, an agent edits it): if you have no unsaved edits, the editor quietly reloads it. If you do, a banner reads “File changed on disk while you have unsaved edits.” with **Reload from disk** and **Keep mine**, so neither your edits nor the agent’s are silently lost.

Closing a file with unsaved changes asks “Discard unsaved changes?”.

### Quick Open

**Ctrl+P** opens a file-name search over the sidebar’s folder. File names that start with what you type rank first, then names that contain it, then paths that contain it. It shows the top 50 results. Use ↑ / ↓ and Enter to open, and Esc to close. You need a folder open in the sidebar first.

## Projects

A **project** remembers everything about a folder you work in: its location, shell, deck layout, environment variables and start-up commands. Opening it sets all of that up in a new deck.

### Creating a project

Press **Ctrl+Shift+N**, click **New** in the project switcher, or use **Settings → Projects → New project**.

| Field | What it’s for |
|---|---|
| Name | Required. Filled in from the folder name if you use **Browse** first. |
| Default shell | The shell new panes use in this project |
| Color | The deck colour, from the same 8 colours as deck tabs |
| Root directory | Required. The project’s folder. |
| Description | Optional |
| Workspace template | The layout to open with: Single, Split, Quad, Six or Eight |
| Environment variables | Name/value pairs added to every terminal in the project. Values are **encrypted at rest** with your Windows account (DPAPI) and never written to the session file. |
| Auto-start commands | Commands to run when the project opens, in order, each typed into a numbered pane (1–16) after an optional delay in milliseconds. Each row can be switched on or off and given a label. |

Click **Create project** (or **Save changes** when editing).

### Opening a project

Open the project switcher with **Ctrl+K** or by clicking the project pill in the top bar. Type to filter, use ↑ / ↓, and press Enter.

Opening a project:

1. Creates a new deck named after the project, in its colour, using its template.
2. Starts new panes in the project’s folder with its shell and environment variables, and points the sidebar at that folder.
3. Runs the auto-start commands, each once its pane’s shell is ready. A command with a label also names its pane. If a command targets a pane number the layout doesn’t have, it goes to the last pane instead. When they’ve all run, you see “Auto-start complete”.

Each deck remembers its project. Switching decks switches the project pill, the sidebar folder, and where new panes start. To attach an existing deck to a different project, right-click its tab → **PROJECT**.

### The default project (★)

In the switcher, click the ★ on a project to make it your **default project**. New workspace dialogs preselect it, and TerminalDeck opens it automatically when it starts without a saved session to restore. New windows open it too.

### Editing and deleting

Use the ✎ and 🗑 buttons in the switcher or in **Settings → Projects**. Deleting a project only removes the project entry. “the folder and its files stay untouched.”
