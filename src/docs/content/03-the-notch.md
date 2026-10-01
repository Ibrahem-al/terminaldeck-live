# The notch

The notch is a small pill that sits at the top centre of your main display, above every other window. Its job is to tell you, wherever you are, when an agent in TerminalDeck needs you, and to let you answer without switching windows.

It’s on by default. Turn it off with **Settings → Notch → Enable the notch**.

## What you’ll see

### The pill (nothing needs you)

A thin dark tab hugging the top edge of the screen.

- A **grey dot** means nothing is running.
- A **blinking gold dot** means at least one pane is running a command. The number next to it is how many panes are working.
- Hover over it and it grows to read, for example, “2 working · 6 panes”.
- Click it to open the **pane dashboard** (the pulldown, below).

### An alert (something needs you)

A wider bar slides down from the top edge. It shows an icon, the pane’s name in bold and what happened. With several alerts pending, a gold count badge shows how many.

| Icon | Kind | Example |
|---|---|---|
| **?** (gold, gold border) | A question: the agent needs your input or permission | “api — Claude needs your permission to use Bash” |
| **✓** (green) | A turn finished, or a long command finished | “finished a turn — waiting for you”, “command finished · 12s”, “exit 1 · 2m 3s” |
| **·** (grey) | A best guess that something may be waiting for you | “may be waiting for input”, “rang the bell” |

Each pane has at most one alert at a time; a newer one replaces the older.

Click the alert to open the pulldown on that pane.

### The pulldown

A larger panel that drops down from the notch:

- **Header.** The alert or pane name and detail, plus three buttons: **Open ↗** jumps to the pane in TerminalDeck, **✕** dismisses the alert, and **⌃** collapses the panel (**Shift+Esc**).
- **Chips.** One chip per alert and one per running pane. Click a chip to switch to it.
- **A live mini terminal** of the selected pane. It’s the real session, not a copy. **You can type into it**: answer the permission prompt, press Enter and carry on. The mini terminal never resizes the pane itself.

Press **Esc** or **Shift+Esc** to collapse it. Clicking elsewhere also closes it. If the notch opened by itself and you don’t touch it, it collapses after 30 seconds.

### Jumping to a pane

**Open ↗** brings the right TerminalDeck window to the front (restoring it if it was minimized), switches to the pane’s deck, un-hides the pane if it was hidden, and focuses it.

## When alerts go away

An alert clears when:

- you press Enter in that pane, whether in TerminalDeck, in the notch’s mini terminal or from your phone;
- the pane’s terminal session ends;
- a good amount of new output arrives in the pane after the alert (the agent has moved on);
- you dismiss it with **✕**.

With **Pill visibility** set to **Hidden until needed**, “finished” alerts also tuck themselves away after about 5 seconds, unless you’re hovering over or typing in the notch. Questions and “may be waiting” hints never dismiss themselves.

## Exact detection: Claude Code hooks

On its own, TerminalDeck *guesses* when an agent is waiting, by watching the screen, the terminal bell and notification codes. For Claude Code you can make this exact:

1. Open **Settings → Notch**.
2. In the **Claude Code hooks — exact detection** box, click **Install hooks**.
3. The status reads “Installed — exact detection active for new claude sessions”.

This adds a small hook to `~/.claude/settings.json` for four Claude Code events (session start, notification, stop, session end). It keeps any hooks of your own that are already there. The hook does nothing when `claude` runs outside TerminalDeck. It only affects `claude` sessions **started after** you install it, and it covers `claude` running natively on Windows, not inside WSL.

With hooks installed:

- Permission requests and other questions arrive as **?** alerts with Claude’s own message.
- The end of each turn arrives as “finished a turn — waiting for you” (if **Turn finished** is on).
- Deck tools can read a Claude Code pane from its conversation transcript rather than its screen (see [Agents working together](04-agents-working-together.md)).
- The **Resume conversation** offer after a restart knows which conversation each pane was in.

To undo it, click **Remove hooks**. If the hooks aren’t installed, the status reads “Not installed — the notch falls back to heuristics”.

## Heuristics (for other CLIs, or without hooks)

With **Waiting-detection heuristics** on (the default), TerminalDeck also raises “may be waiting” hints:

- **Screen check.** When a running command has printed some output and then gone quiet for about 8 seconds, TerminalDeck scans the last few lines for prompts such as “do you want”, “(y/n)”, “[y/n]”, “permission”, “press enter”, “continue?” or a line ending in “?”. It doesn’t scan full-screen apps.
- **Terminal bell.** A running program ringing the bell shows “rang the bell”. This is limited to one alert every 15 seconds per pane.
- **Notification codes.** Programs that send a desktop-notification escape code (OSC 9) have that text shown as the alert.

Heuristics are ignored for a Claude Code session that the hooks already cover.

## Notch settings

All of these are in **Settings → Notch**.

| Setting | Default | What it does |
|---|---|---|
| Enable the notch | On | Shows the always-on-top pill |
| Pill visibility | Always visible | **Hidden until needed** keeps the pill off-screen until there’s an alert, or until you park the mouse at the top-centre edge of the screen (like taskbar auto-hide) |
| Size | Normal | Small, Normal, Large or Extra large. Scales the pill, alerts and pulldown. |
| Show while TerminalDeck is focused | On | Off: the notch only appears while you’re working in other apps |
| Auto-focus questions | On | When a question arrives and you’re not mid-typing, the pulldown takes the keyboard so you can answer straight away |
| Turn finished | On | Alert when an agent finishes a turn and is waiting for you (needs the hooks) |
| Command finished | On | Alert when a long shell command completes |
| Minimum command time | 15 seconds | Only alert for commands that ran at least this long (1–3600) |
| Waiting-detection heuristics | On | The best-effort hints described above |
| Desktop notification on task finish | Off | Also raise a Windows notification when a long command finishes |
| Minimum task time | 20 seconds | Shown when desktop notifications are on. Only notify for tasks at least this long (0–3600). |

The notch is always hidden while the screen is blacked out (see [Walking away](07-walk-away.md)).

## Desktop notifications

With **Desktop notification on task finish** on, a finished command also raises a normal Windows notification, titled “✓ *pane* finished” or “✗ *pane* — exit *N*”, with how long it took. This is separate from the notch alerts. It’s useful when TerminalDeck is in the background and you have the notch turned off.
