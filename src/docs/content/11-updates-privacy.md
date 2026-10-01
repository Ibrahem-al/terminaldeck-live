# Updates, data and privacy

## Updates

TerminalDeck checks for a new version once each time it starts. You can also check at any time in **Settings → Updates → Check for updates**.

When an update is available:

1. **Settings → Updates** shows “Version *X* is available.” with the release notes. Click **Download update**.
2. It downloads in the background, with a progress bar. When it finishes, a notification reads “Update v*X* ready” with a **Restart** button, and Settings shows **Restart & install**.
3. Click either one to install now. Or just carry on: a downloaded update installs by itself, silently, the next time you quit TerminalDeck.

Updates install in place and keep your settings, projects, saved session and paired phones.

### How updates are verified

Before TerminalDeck runs a downloaded installer, it checks it two ways:

- **SHA-512 checksum.** The installer must match the checksum published with the release. An update without a checksum is refused.
- **minisign signature.** The installer must carry a valid signature made with the TerminalDeck release key. The public key is built into the app, and the private key never leaves the release machine. The signature also names the version, so an older signed installer can’t be passed off as a newer one.

If either check fails, the update isn’t installed.

> The installer you download from the website isn’t Authenticode-signed yet, which is why Windows SmartScreen may warn about it the first time (see [Getting started](01-getting-started.md)). The in-app update path above is signed and verified.

A download that stops sending data for 60 seconds fails, rather than hanging. Click **Try again**.

## Where your data lives

Everything TerminalDeck keeps is on your PC, in **`%APPDATA%\quarterdeck`**. To open that folder, paste `%APPDATA%\quarterdeck` into Explorer’s address bar.

| What | Where |
|---|---|
| Settings, projects and your saved session | `quarterdeck.json` |
| Recent output of each pane, used after a restart | the `scrollback` folder |
| The phone server, if you turned phone access on | a folder in the same place |

- **Environment variables** you give a project are encrypted with Windows DPAPI, which ties them to your Windows user account. They’re never written into the saved session.
- The app itself is installed separately, in `%LOCALAPPDATA%\TerminalDeck` by default.

## Privacy

- **No account, no cloud and no telemetry.** TerminalDeck doesn’t send usage data anywhere.
- **The connections TerminalDeck makes itself:**
  - checking for and downloading updates, from the project’s GitHub releases;
  - downloading the phone server, once, and only if you turn on phone access.
- **Things you opt into that use other services:**
  - **Smart pane names** run `claude -p` on your own Claude account, which spends tokens.
  - **Phone access** runs a server on your PC that your phone connects to directly, over your network or Tailscale.
- **Deck tools** run only on your PC. Agents reach them over a local-only connection (127.0.0.1), and every request has to present a secret that only TerminalDeck’s own terminals have. Panes are read only when an agent asks, and nothing is cached. Whatever an agent reads can of course end up in that agent’s conversation with its own provider, the same as anything else it reads.
- **The Claude Code hooks** only report to TerminalDeck on your PC, and only for `claude` sessions running inside TerminalDeck.

## Uninstall

1. *Optional, but tidy:* in **Settings → Notch**, click **Remove hooks** to take TerminalDeck’s hook out of `~/.claude/settings.json`. (If you skip this, the hook stays but does nothing, because it only acts inside TerminalDeck.)
2. Uninstall **TerminalDeck** from **Windows Settings → Apps → Installed apps**.
3. Your data in `%APPDATA%\quarterdeck` is left in place, in case you reinstall. To remove everything, delete that folder.

If you allowed phone access through the firewall, you can also delete the “TerminalDeck phone access” rule in **Windows Defender Firewall → Advanced settings → Inbound Rules**.
