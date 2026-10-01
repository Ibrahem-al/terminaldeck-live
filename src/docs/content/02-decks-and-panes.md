# Decks and panes

A **deck** is a workspace tab. Each deck holds its own tiled layout of **up to 16 panes**, counting hidden ones, plus its own name, colour and, optionally, a project. A **pane** is either a terminal or an editor.

Nothing you do to the layout kills a session. Splitting, swapping, hiding, zooming or moving a pane to another deck leaves whatever is running in it running.

## Creating a deck

Press **Ctrl+T** or click **+** in the tab strip to open the **New workspace** dialog.

- If you have projects, a **Project** dropdown at the top lets you open the deck in one. Panes then start in the project’s folder, with its shell and environment variables.
- Pick a template:

| Template | Layout | Panes |
|---|---|---|
| Single | 1×1 | 1 |
| Split | 1×2 | 2 |
| Quad | 2×2 | 4 |
| Six | 2×3 | 6 |
| Eight | 2×4 | 8 |

Templates go up to 8 panes. To get more, split panes, up to the limit of 16 per deck. The template that starts highlighted comes from **Settings → General → Default workspace template**, or from the project’s own template if you picked a project.

Other ways to get a deck:

- **Prefix c** opens a new Single deck straight away, with no dialog.
- **Prefix !** moves the active pane out into a new deck of its own.
- Opening a project creates a deck named after it (see [Files, editor and projects](05-files-editor-projects.md)).

New decks are named “Deck 1”, “Deck 2” and so on, and each takes the next colour in the cycle. There is always at least one deck: close the last one and a fresh Single deck takes its place.

## Working with deck tabs

| To… | Do this |
|---|---|
| Switch deck | Click its tab, **Ctrl+Tab** / **Ctrl+Shift+Tab**, **Ctrl+1**…**Ctrl+9**, or **Prefix n** / **p** / **1–9** |
| Rename | Double-click the name, or right-click → **Rename tab**. Enter saves, Esc cancels. |
| Change colour | Double-click the colour dot to cycle through the 8 colours, or right-click → **TAB COLOR** |
| Attach to a project | Right-click → **PROJECT** → pick a project (or **No project**). This only changes where *new* panes start. Panes already open are untouched. |
| Reorder | Drag the tab |
| Close | The tab’s ✕, right-click → **Close tab**, **Ctrl+W**, or **Prefix &** |

An inactive tab shows a dot when panes in it have unread agent messages.

## Splitting panes

| To… | Do this |
|---|---|
| Split right (new terminal) | **Ctrl+D**, **Prefix %**, or the **Split right** button in the pane header |
| Split down (new terminal) | **Ctrl+Shift+D**, **Prefix “**, or the **Split down** button |
| Choose the shell, or open an editor | The **Split options** chevron in the pane header. Pick **Right** or **Down**, then any installed shell or **Editor**. You can mix shells in one deck. |

The pane header’s buttons appear when you hover over it. Right-click the header for a menu with the same actions, which helps when a pane is too narrow to show them all.

A new pane takes half the space of the pane you split, and becomes the active pane. When a deck already has 16 panes you’ll see “Pane limit reached (16 per workspace)”.

**Resize** a split by dragging the line between panes; each side keeps between 15% and 85%. Double-click the line to reset it to 50/50. You can also Tab to a divider and move it with the arrow keys.

## Moving around

- Click a pane to make it active. The active pane has an accent-coloured border.
- **Alt+Arrow** moves to the pane in that direction. **Alt+[** and **Alt+]** cycle through panes.
- **Prefix Arrow** or **Prefix h / j / k / l** moves in a direction. **Prefix o** goes to the next pane, and **Prefix ;** goes back to the pane you were in before.
- **Prefix q** shows a big number over every pane for 3 seconds. Press a digit to jump to that pane.

## Swapping

- **Drag a pane’s header onto another pane.** The target shows “Swap here”, and the two panes trade places. This works within one deck.
- **Alt+Shift+Arrow** swaps the active pane with its neighbour in that direction.
- **Prefix {** / **Prefix }** swaps with the previous / next pane.

## Zoom

**Prefix z** makes the active pane fill the whole deck. The other panes keep running underneath. A **Zoomed** chip appears in the top-right corner; click it or press **Prefix z** again to go back to the split view. Moving focus to another pane or splitting also ends the zoom, the same as in tmux.

## Hide and restore

Click **Hide pane** (the eye icon) in the pane header to take a pane out of the layout. It keeps running. A **N hidden** button appears in the bottom-left corner of the deck. Click it to see the hidden panes, then click a name to restore that pane next to the active one, or ✕ to close it.

You can’t hide a deck’s only visible pane.

## Move a pane to another deck

Click **Move to another deck** in the pane header, then pick a deck or **New deck**. The session keeps running, and the deck you move it to becomes the active one. **Prefix !** does the same thing with a new deck.

## Pin

**Pin pane** in the header, labelled “Pin pane (prevents closing)”, stops a pane from being closed. Its close button greys out, and a deck that holds a pinned pane refuses to close (“Tab has pinned panes”). Pin anything you really don’t want to lose to a stray **Ctrl+W**, such as a long-running agent.

## Badges

Click **Set pane badge** (the tag icon) in the header, or right-click → **Set badge…**. You get:

- presets: **Claude Code**, **Dev Server**, **Git**, **Test Runner** and **REPL**;
- a free-text name;
- a colour wheel with a brightness slider and a hex field.

Click **Apply** to set the badge, or **Remove** to take it off. A pane’s badge colour is also the colour of its message packets (see [Agents working together](04-agents-working-together.md)).

## Pane names

Every pane header shows a name. By default TerminalDeck keeps it up to date with what the pane is doing.

| Mode (Settings → Pane names) | What you get |
|---|---|
| **Off — keep the names I gave them** | Panes keep the names you give them (“Terminal 1”, “Editor 2”, or your own). |
| **Auto — title or command** (default) | The name comes from the running program’s window title (Claude Code, vim and ssh set one), or from the command itself, e.g. `npm run dev` or `cargo build`. It’s instant and free. |
| **Smart — Auto plus Claude summaries** | Same as Auto, plus every so often Claude writes a 2–5 word title for a busy pane, such as “Fixing Pane Focus Bug”. |

- With **Include the folder** on (the default), the working folder is added, e.g. `cargo build · rust_app`.
- A small sparkle icon next to a name means it was generated automatically.
- **To rename a pane yourself**, click its name. Enter saves, Esc cancels. A name you type yourself stays put until you choose **Reset to auto name** from the header’s right-click menu. To keep a generated name, click it and press Enter.
- **Smart mode costs tokens.** It runs `claude -p` in the background on your own Claude account, using the model in **Settings → Pane names → Model** (default `haiku`). It only summarizes panes that are busy and whose screen has changed, at most once per pane every **Summarize every** seconds (default 120). If `claude` isn’t installed or the call fails, the Auto name stays. Auto mode never calls out.

## Closing, and close confirmations

Close a pane with its ✕, the header menu’s **Close pane**, the hidden-panes list, or **Prefix x**. Closing a deck’s last pane closes the deck.

TerminalDeck asks before closing things according to three settings in **Settings → General**:

| Setting | Default | When it asks |
|---|---|---|
| Confirm before closing a deck | On | Closing a deck by any route, including closing its last pane |
| Confirm before closing a pane | Off | Closing any single pane |
| Confirm before closing a window | On | Closing a window that still has live terminals or unsaved files |

The dialog says what will end, e.g. “Closing ends 2 terminals and 1 editor in this deck”, and warns that it can’t be undone. Enter confirms and Esc cancels. Tick **Don’t ask again (change in Settings → General)** to turn that confirmation off. Pinned panes skip the dialog and simply refuse to close.

## More than one window

Press **Ctrl+Shift+M**, or click the new-window button in the top bar, to open another window.

- Your **first** window owns the saved session: it restores on launch and saves as you work. Extra windows start fresh, so they can’t overwrite it. If you’ve set a ★ default project, a new window opens it.
- If you close the first window while others are still open, one of them takes over saving the session.
- **Closing a window ends the terminals in it.**
- Closing the last window quits TerminalDeck, notch included.

## Restarting with memory

When you start TerminalDeck again (with **On startup** set to **Restore last session**, the default), your decks come back: same layouts, names, badges, pins and colours. Each terminal opens in the folder it was last in.

Restored terminals start as **fresh shells**. Old output isn’t painted back in, because a replayed screen looks live and invites you to type into it. Instead:

- **If the pane was in a Claude Code conversation**, a bar at the top reads *"This pane was in a Claude conversation. It was not resumed — resuming counts toward your Claude usage."* You get three choices:
  - **Resume conversation** types `claude --resume <id>` and picks the conversation back up.
  - **New conversation** starts a fresh Claude session in that pane.
  - **✕** (“Keep the plain shell”) dismisses the bar.

  Nothing resumes on its own. Typing at the prompt also dismisses the offer. If you leave it unanswered, it’s offered again after the next restart.
- **To see what a pane showed before the restart**, turn on **Settings → Terminal → Show history after restart** (off by default). Restored panes then get a **Show history** button that opens a read-only view headed “Before the restart”. Only the most recent output is kept. Click **Back to terminal** or press Esc to close it.

A terminal whose shell has exited shows “Session ended · exit N” with a **New session** button that starts a new shell in the same pane.
