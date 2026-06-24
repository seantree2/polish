# Polish

A small desktop app for **Mac and Windows**. Select text in any app, press a
keyboard shortcut, and Claude rewrites it in place. By default it just makes the
writing better — but you can edit the prompt, add your own, pick the Claude
model, and set your own shortcut.

---

## What it does

1. You select text anywhere (an email, a document, a browser box).
2. You press the shortcut (default **Ctrl+L**, or **⌘+L** on Mac — changeable in Settings).
3. Polish copies the selection, sends it to Claude with your active prompt, and
   pastes the improved version straight back over your selection.

It lives in the menu bar (Mac) / system tray (Windows) — there's no main window,
just a **Settings** screen.

---

## For Sean — getting it running (plain English)

You only need to do this once. Rob can do the technical first-time setup; after
that it's just an app you open.

1. **Install Node.js** (a free tool that runs the app) from <https://nodejs.org>
   — pick the "LTS" button.
2. Open a terminal **in this folder** (`Polish`).
   - Windows: in File Explorer, type `powershell` in the address bar while inside
     the folder and press Enter.
3. Type this and press Enter (downloads the building blocks — takes a minute):

   ```
   npm install
   ```

4. Type this to start it:

   ```
   npm start
   ```

5. A **Settings** window opens the first time. Paste your **Claude API key**
   (get one at <https://console.anthropic.com/settings/keys>), click **Save key**,
   then **Test connection**. Close the window — the app keeps running in the
   tray/menu bar.

Now go to any app, select some text, and press the shortcut.

> **Mac only — one permission step:** the first time, macOS will ask to allow
> Polish to control your keyboard. Go to **System Settings → Privacy & Security →
> Accessibility** and switch **Polish** (or **Terminal**, if you ran `npm start`)
> on. This is what lets it copy your selection and paste the result.

---

## For Rob — build & package

```bash
npm install          # install dependencies
npm start            # run in dev (regenerates icons first)

npm run dist:win     # build a Windows installer  -> dist/*.exe
npm run dist:mac     # build a macOS .dmg          -> dist/*.dmg
npm run dist         # build for the current OS
```

Icons are generated from `scripts/make-icons.js` (pure Node, no binaries
committed). `electron-builder` turns `build/icon.png` into `.ico`/`.icns`.

Code signing is not configured. Unsigned builds will trigger Windows SmartScreen
("More info → Run anyway") and macOS Gatekeeper (right-click → Open the first
time). Add certificates in `package.json` → `build` when ready to distribute.

---

## How it works (architecture)

| File | Role |
|------|------|
| `src/main.js` | Tray app, global shortcut, capture → transform → paste flow |
| `src/transform.js` | Calls Claude via the official `@anthropic-ai/sdk` |
| `src/paste.js` | Simulates Copy/Paste (AppleScript / PowerShell / xdotool) |
| `src/settingsStore.js` | Saves settings; encrypts the API key with `safeStorage` |
| `src/preload.js` | Safe bridge between the Settings window and the app |
| `src/settings.*` | The Settings UI |

- The **API key** is encrypted by the OS keychain (`safeStorage`) and never sent
  to the Settings window — only a "key saved" flag is.
- The selection is captured by briefly setting the clipboard to a marker,
  simulating Copy, and reading what changed. Your previous clipboard is restored
  about 0.7 seconds after pasting.
- Thinking is disabled and effort is set to `low` for fast, inline rewrites
  (Opus/Sonnet). Haiku is sent neither, since it doesn't accept the effort flag.

---

## Privacy & security

Polish **never saves the text you refine.** Your selection and Claude's rewrite
live only in memory for the few seconds of a transform — they are never written
to disk, never logged (the app emits no logs at all), and never cached.

- The only file Polish writes is `config.json` (in the OS user-data folder),
  holding **only** your settings (shortcut, model, your prompt templates) and your
  **API key, encrypted** by the OS keychain. The writer enforces a strict key
  allowlist, so refined text can never land there even by accident.
- Windows are hardened (context isolation on, Node integration off, local files
  only, content-security-policy); the unused sharing/relay modules are excluded
  from the packaged app.
- **The one place text leaves your device:** to refine it, Polish sends it to
  Anthropic's API over HTTPS — unavoidable for any cloud-AI tool. Anthropic does
  not train on API inputs. Polish itself keeps none of it.

**Verify it yourself:** refine a unique phrase, then run
`grep -rl "your-phrase" ~/Library/Application\ Support/Polish/` — it finds nothing.

---

## Settings

- **Model** — Opus 4.8 (most capable), Sonnet 4.6 (balanced), or Haiku 4.5 (fastest).
- **Shortcut** — click **Record** and press your combination.
- **Prompts** — add as many as you like; the one marked **Active** is used by the
  shortcut. The default is *"Make this text better."*

---

## Sharing with testers (no key for them)

Polish can let other people use it through **your** API key, so testers don't
need their own. One person is the **host** (holds the key); everyone else
**connects** to it.

**Host (you):**
1. Settings → save your **API key** (Power source → API key).
2. Settings → **Share with testers (host)** → tick **Run the sharing server**.
3. For testers on your Wi-Fi: share the **network address** + **password** shown.
4. For testers anywhere: click **Start internet tunnel** (first time auto-downloads
   the `cloudflared` helper on Windows; on macOS run `brew install cloudflared`
   first). Share the **public address** + **password**.
5. Keep your computer **on and awake** while they test.

**Tester (them):** install Polish → Settings → Power source → **Connect to a
shared Polish** → paste the **address** and **password** you gave them →
**Test connection**. Done — they press the shortcut like normal.

> Security: the relay is protected by the shared password; click **New** to rotate
> it anytime. All testers' usage is billed to your one API key, so only share the
> address/password with people you trust, and stop the tunnel when the test ends.
> A relay on your PC is fine for a test; for something longer-lived, host it on a
> small cloud server instead.

## Troubleshooting

- **"Nothing selected"** — make sure text is highlighted before pressing the
  shortcut. As a fallback, copy the text and use the tray menu's *Transform
  clipboard text*.
- **Nothing pastes (Mac)** — grant Accessibility permission (see above).
- **Shortcut doesn't fire** — another app may own that combination. Pick a
  different one in Settings.
- **"Transform failed"** — check the API key and your internet connection; the
  message shows what Claude/the network reported.
