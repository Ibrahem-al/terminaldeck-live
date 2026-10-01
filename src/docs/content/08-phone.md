# Your phone

You can see and drive your TerminalDeck terminals from your phone using the **T3 Code** mobile app. T3 Code is a separate app, not made by TerminalDeck. A terminal on the phone is **the same session** as the pane on your desktop, not a copy. Type `git status` on the phone and the output scrolls in the desktop pane too.

Phone access is **off by default**. Your desktop terminals work the same whether it’s on or off.

## What you need

- The **T3 Code** app on your phone.
- A way for the phone to reach your PC, either:
  - **the same Wi-Fi or local network**, or
  - **Tailscale** running on both the PC and the phone, which works from anywhere.

## Turn it on

1. Open **Settings → Phone** and turn on **Phone access**.
2. The first time, TerminalDeck downloads its phone server (a one-time download of about 40 MB). **Status** shows “Downloading… N%”. The download is checked against a fingerprint built into the app before it’s used.
3. When **Status** reads **Running on port 8792**, you’re ready to pair.

## Pair a phone

1. In **Settings → Phone**, click **Pair a phone**. A QR code appears.
2. On your phone, install T3 Code, then open **Settings → Environments → Add environment**.
3. Scan the QR code. If you can’t scan it, type in the **Host** (for example `http://192.168.1.20:8792`) and the **Pairing code** shown next to the QR code.

A pairing code **works once** and expires at the time shown. The phone stays paired after that, so you don’t need to pair again next time. Click **New pairing code** to pair another phone.

## What the phone sees

- Your terminal panes appear as **threads, grouped by working folder**. Open one and tap the terminal button to get the live terminal.
- What you type on the phone goes to the real shell on your PC, and the desktop pane shows the same output.
- A terminal you open *from* the phone shows up on your desktop as a new pane in the active deck. If that deck is full, it goes in a new deck called “Phone”.
- When you close a pane on the desktop, its thread is archived on the phone about a minute later.

## Settings

| Setting | Default | What it does |
|---|---|---|
| Phone access | Off | Runs the phone server |
| Status | — | Off, Downloading…, Starting…, Running on port *N*, Not running (with the error) |
| Phone connects through | Automatic | Which network address pairing links use. **Automatic** picks a normal network adapter first, then Tailscale. You can pick a specific Wi-Fi, Ethernet or Tailscale address instead. Virtual adapters (such as WSL’s) are marked “(virtual)”. |
| Port | 8792 | The port the phone server listens on (1024–65535). Paired phones remember it, so changing it means pairing them again. |
| Windows Firewall | — | Shown while the server is running. See below. |

## Windows Firewall

While phone access is running, **Settings → Phone** shows whether Windows Firewall lets phones in:

| Badge | Meaning |
|---|---|
| Allowed | Phones on your network and tailnet can connect |
| Not set up | Windows may ask whether Node.js can use the network the first time a phone connects |
| Partly blocked | Allowed on some networks only. If your Wi-Fi is marked **Public**, phones can’t connect. |
| Blocked | Windows is blocking the phone server |
| Off | Windows Firewall is off |
| Unknown | TerminalDeck couldn’t read the firewall rules |

Click **Allow** to fix it. Windows asks for administrator permission, then TerminalDeck adds one inbound rule, “TerminalDeck phone access”, that lets in **your local network and Tailscale only**.

## Good to know

- The phone server runs on your PC only while TerminalDeck is running, and stops when you quit.
- The connection is direct between your phone and your PC, over your own network or tailnet. TerminalDeck doesn’t relay it through any server.
- The connection is plain HTTP on your local network or tailnet, so pair only on networks you trust. On other networks, use Tailscale.
