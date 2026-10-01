# Walking away

Agents often keep working after you leave the desk. These features make sure the PC doesn’t fall asleep on them, the screen isn’t lit up for nobody, and you still hear about it when an agent needs you.

## Keep the PC awake while agents work

**Settings → General → Keep computer awake while agents are working** (off by default).

While it’s on, TerminalDeck stops Windows from going to sleep as long as any terminal is still producing output. In practice, a terminal counts as working until it has been quiet for about 90 seconds. Once everything is idle, it lets go and your normal sleep settings apply again.

- The **display** can still turn off. Only system sleep is held off.
- **On battery it does nothing** unless you also turn on **Settings → Power → Keep the PC awake on battery**. So by default a laptop unplugged from the wall still sleeps normally.

## Blackout

Blackout covers **every monitor** with plain black after a stretch without keyboard or mouse input, so an OLED screen isn’t burning in a static terminal layout and a room nobody is in isn’t lit up. The **first key press or mouse movement** brings everything straight back. Nothing that’s running pauses.

### Black out right now

- Press **Ctrl+Shift+B**, or
- click the black-out button in the top bar (the crossed-out monitor icon).

Both work even when automatic Blackout is off. Hide the top bar button with **Settings → Blackout → Top bar button**. Ctrl+Shift+B works either way.

### Automatic Blackout

Turn on **Settings → Blackout → Black out the screen when you’re away**, then choose how long to wait.

| Setting | Default | What it does |
|---|---|---|
| Black out the screen when you’re away | Off | Turns automatic Blackout on |
| Wait for | 5 minutes | Time without input before the screen goes black: 1, 2, 5, 10, 15 or 30 minutes |
| Only while agents are working | Off | On: only black out while a terminal is still producing output. Off: black out any time you step away. |
| Only while TerminalDeck is in front | On | Only black out if a TerminalDeck window was the one you were using. Going idle in a browser or another app is left to that app. The button and Ctrl+Shift+B ignore this. |
| Wake when an agent has a question | On | Lights the screen back up when an agent asks for permission, so a blocked turn doesn’t sit unnoticed behind a black screen |
| Stay awake for | 1 minute | How long that wake lasts before going black again: 15 seconds, 30 seconds, 1 minute, 3 minutes or 10 minutes |
| Top bar button | On | Shows the black-out-now button in the top bar |

**How “wake on question” works.** When a Claude Code agent asks a question (this needs the Claude Code hooks; see [The notch](03-the-notch.md)), the screen lights up showing the question in the notch. If you don’t respond, it goes black again after the **Stay awake for** time. Each question wakes the screen only once. After that, only a new question, or you coming back, lights it again.

While the screen is black, the notch is hidden, and animations and cursor blinking pause.

## Power and efficiency

**Settings → Power**:

| Setting | Default | What it does |
|---|---|---|
| Keep the PC awake on battery | Off | Lets the keep-awake setting above hold the PC awake on battery too. Off: on battery, the PC is free to sleep as normal. |
| Efficiency mode for the app’s browser processes when not in front | On battery | While no TerminalDeck window is focused, asks Windows to run TerminalDeck’s own interface processes on the efficient cores. Options: **Off**, **On battery**, **Always**. **Your terminals, and whatever runs in them, are never throttled.** |

TerminalDeck also cuts back on its own without any setting. Panes that aren’t on screen stop rendering, output for them is batched far less often, and animations pause while the window is minimized. After about 5 minutes minimized, a window also releases its graphics memory.
