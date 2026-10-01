# Troubleshooting

## Installing and starting

**"Windows protected your PC” when I run the installer.**
This is SmartScreen. The installer isn’t Authenticode-signed yet. Click **More info**, then **Run anyway**. Updates you install from inside the app are signed and verified (see [Updates, data and privacy](11-updates-privacy.md)).

**The app won’t start, or the window stays blank, on Windows 10.**
TerminalDeck draws its window with Microsoft Edge **WebView2**. Windows 11 has it built in, and the installer normally fetches it on Windows 10, but that needs an internet connection during install. Install the **WebView2 Runtime (Evergreen)** from Microsoft’s website, then start TerminalDeck again.

**My last session didn’t come back.**
Check **Settings → General → On startup** is set to **Restore last session**. Only your first window restores and saves the session. Extra windows opened with Ctrl+Shift+M start fresh.

## Terminals

**A terminal is blank, garbled, or the wrong size.**
Click **Reload terminal display** (the circular-arrow button in the pane header), or right-click the terminal → **Reload display**. It repaints and re-fits the terminal without touching what’s running, your scrollback or what you’ve typed.

**Ctrl+D / Ctrl+W / Ctrl+A don’t do what my shell expects.**
TerminalDeck uses those keys itself, even inside terminals: Ctrl+D splits, Ctrl+W closes the deck, and Ctrl+A is the tmux prefix. The same goes for Ctrl+T, Ctrl+P, Ctrl+K and Ctrl+B. To free Ctrl+A, change **Settings → Shortcuts → Prefix key** to **Ctrl+Space** or **Alt+Q**, or turn off **tmux prefix mode**. See [Keyboard shortcuts](10-shortcuts.md#keys-the-app-keeps).

**I can’t click inside Claude Code or vim.**
**Settings → Terminal → Select text in full-screen apps** is on, so plain clicks select text instead of reaching the app. Turn it off if you need to click inside those apps. **Shift+drag** still selects either way.

**My selection disappears before I can copy it.**
Leave **Copy on select** on (the default). Selecting copies straight away.

**Clicking a link doesn’t open it.**
Hold **Ctrl** and click. A plain click is kept for selecting and moving the cursor.

**Command-finished alerts, pane names from commands, or the folder in the pane header don’t work in one pane.**
That pane is probably **Command Prompt** (cmd), which can’t report what it’s running. Use PowerShell, PowerShell 7 or Git Bash for those features.

**Ctrl+F doesn’t search.**
Terminal search isn’t available while a full-screen app (vim, less and so on) is on screen, because the app gets the key. Exit the app, or use its own search.

## The notch

**The notch doesn’t notice when Claude asks me something.**
1. Install the hooks: **Settings → Notch → Install hooks**.
2. **Restart `claude`** in that pane. The hooks only apply to sessions started after you install them.
3. Make sure `claude` runs natively on Windows, not inside WSL.
4. Check that **Settings → Notch → Enable the notch** is on.

Without hooks, the notch can only guess (see “Heuristics” in [The notch](03-the-notch.md)).

**The notch hides while I’m using TerminalDeck.**
Turn on **Settings → Notch → Show while TerminalDeck is focused**.

**I can’t see the notch at all.**
If **Pill visibility** is **Hidden until needed**, park your mouse at the top-centre edge of your main screen to peek it in. The notch is also hidden while the screen is blacked out.

**Too many “command finished” alerts.**
Raise **Settings → Notch → Minimum command time**, or turn off **Command finished**.

## Agent messages

The Messages drawer (**Ctrl+Shift+X**) shows why each message wasn’t delivered. Here’s what the common reasons mean:

| The drawer says | What it means | What to do |
|---|---|---|
| queued — waiting: the agent is working | The receiving agent is busy. The message waits. | Nothing. It’s delivered when the agent goes idle (up to 10 minutes). |
| the input box isn’t empty | Something is typed in the receiver’s input box | Clear or send what’s there |
| a dialog is open | The receiver is showing an approval prompt or menu | Answer it |
| someone is typing there | You’re typing in that pane | Stop for a moment |
| that pane is at a shell prompt | No agent is running there, just a shell | Start `claude` or `codex` in it |
| that pane isn’t running Claude Code or Codex | Some other program is running there | Messages only go to Claude Code and Codex |
| that shell doesn’t report what it’s running | The pane is Command Prompt (or another shell without integration) | Run the agent in PowerShell or Git Bash |
| that agent runs without approvals | It was started with a bypass flag such as `--dangerously-skip-permissions`, or shows “bypass permissions on” | Restart it with approvals, or turn on **Also message agents running without approvals** |
| the agent is still starting | The agent only just launched | Nothing. It retries shortly. |
| the input box can’t be read | TerminalDeck can’t recognise the agent’s input box (for example, in vim mode) | Leave vim mode |
| messaging between agents is turned off | **Let agents message each other** is off | Turn it on in **Settings → Deck tools** |
| messaging is paused | Someone paused messaging in the drawer | Click **Resume** in the drawer |
| these two panes were paused by the loop guard | Two agents exchanged too many messages, too fast | Click **Resume**, or leave it stopped |
| the sender is sending too fast, too many messages overall, too soon after the last message to that pane | Speed limits | Wait a few seconds |
| too many messages are already waiting | 5 are queued for that pane, or 20 in total | Wait for some to deliver, or cancel them |
| the message is too long | Over 2,000 characters or 80 lines | Have the agent write a file and send its path |
| expired — not delivered in 10 minutes | The receiver never went idle with an empty input box | Check on that agent |
| Enter may not have submitted it | The text was typed but still sat in the box afterwards | Look at that pane and press Enter if needed |

**My agent doesn’t seem to have the deck tools at all.**
- Check **Settings → Deck tools → Let agents work with the other panes** is on, along with **Hand the tools to claude in terminals** or **Hand the tools to codex in terminals**.
- These switches only affect terminals opened **after** you change them. Open a new pane and start the agent there.
- If you pass your own `--mcp-config` to `claude`, or have your own `terminaldeck` MCP server set up for `codex`, yours takes priority.

## Phone

**My phone can’t connect.**
1. In **Settings → Phone**, check **Status** says **Running on port 8792** (or your port).
2. Look at the **Windows Firewall** badge. If it says **Blocked**, **Partly blocked** or **Not set up**, click **Allow** and approve the Windows prompt.
3. If your Wi-Fi is set to a **Public** network in Windows, phones on it can’t connect. Set it to Private, or use Tailscale.
4. Make sure the phone is on the same network as the PC, or that Tailscale is running on both.
5. Check **Phone connects through** uses an address the phone can reach. A “(virtual)” adapter usually isn’t one.

**"Port N is already in use by another program."**
Choose a different **Port** in **Settings → Phone**, then pair your phones again.

**The pairing code stopped working.**
Each code works once and expires. Click **New pairing code**.

## Blackout and power

**The screen goes black while I’m reading.**
Blackout goes by keyboard and mouse input. Raise **Settings → Blackout → Wait for**, or turn on **Only while agents are working**.

**The screen never blacks out.**
Check **Black out the screen when you’re away** is on. With **Only while TerminalDeck is in front** on (the default), it only happens if TerminalDeck was the app you were using when you went idle.

**My laptop still sleeps while an agent is working.**
On battery, keep-awake only works if **Settings → Power → Keep the PC awake on battery** is on. It also needs **Settings → General → Keep computer awake while agents are working**.

## Still stuck?

Check **Settings → Updates** to make sure you’re on the latest version. Many fixes arrive there first.
