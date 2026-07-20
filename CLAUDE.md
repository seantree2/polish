# CLAUDE.md — Polish (project context)

Durable context for this project, true every session. For the current point-in-time state (what's mid-flight, what to resume), read `HANDOFF.md` in this same folder. This file is project-specific — it does **not** repeat Cherish's global `~/.claude/CLAUDE.md` rules.

## What Polish is
A cross-platform (macOS + Windows) **menu-bar / tray Electron app** with **no main window**. Select text in any app → press the global shortcut (default **⌘L** / Ctrl+L) → the selection is sent to Claude with the active prompt → the refined text is pasted back in place. A Settings window manages the API key, model, editable prompts, the shortcut, and a Sound toggle. Users bring their **own** Claude API key (encrypted on-device via Electron `safeStorage`); no secrets live in the repo.

**Purpose:** a fast, private, everywhere-available text refiner. **Privacy is a hard product requirement** — see Rules.

## Stack
Electron 32 (Node.js, main process only — no renderer framework) · `@anthropic-ai/sdk` (latest) · `electron-builder` 25 (signed + notarized universal mac dmg + Windows nsis exe) · `electron-updater` 6.8.9 (auto-update on launch + every 6h). Settings/spinner UIs are plain HTML/CSS/JS.

## Repo, ownership, deploy
- **Local folder:** `/Users/cherishmei/Desktop/Claude/polish`
- **Remote:** `https://github.com/cherish-mei/polish` (`origin`), branch **`main`**. **Cherish (cherish-mei) is the sole owner** — transferred from `seantree2` on 2026-07-20; Sean removed as collaborator. Repo is **public** (so James/Sean can download builds). `gh` in this environment is authed as cherish-mei (admin).
- **Signing identity:** `Developer ID Application: Lodinos Pty Ltd (X6495SAQRN)` — **still Sean's Apple cert**, reused by arrangement. So the *repo* is Cherish's alone, but the *signing key* is shared with Sean until she gets her own Apple Developer account. The 6 Apple signing secrets live in the repo's Actions secrets (they transferred with the repo). Keep this identity constant — changing it (or shipping unsigned) forces users to re-grant macOS Accessibility.
- **Release/deploy = GitHub Actions `workflow_dispatch`, NOT tag pushes:**
  1. Bump `version` in `package.json` on `main`, commit + push (`git pull --rebase origin main` first).
  2. `gh workflow run release.yml --ref main --repo cherish-mei/polish`
  3. Poll `gh run view <run-id> --repo cherish-mei/polish --json status` until `completed` (notarization takes a few minutes).
  4. CI publishes a **draft** GitHub release `v<version>`. Make it live with `gh release edit v<version> --repo cherish-mei/polish --draft=false --latest`. For a **non-notarized** build, use `--prerelease --latest=false` instead and hand the direct dmg link to James (terminal route), so auto-update stays untouched.
- **Public download:** `https://github.com/cherish-mei/polish/releases` — **no passcode**. Installed apps auto-update from the Latest release; **pre-releases are ignored by auto-update** (no `allowPrerelease` set), so use a pre-release to hand a build to specific people without disturbing everyone.
- **Run locally:** `npm start` (macOS: the installed `/Applications/Polish.app` holds the single-instance lock — see the verify note in Rules). Manual build: `npm run dist:mac`.

## Key files
- `src/main.js` — app entry: tray, global shortcut, spinner window (`createSpinner`/`showSpinner`/`hideSpinner`), Settings window, `MODELS` list (incl. Fable 5), `runTransform` (captures the frontmost app at ⌘L → re-focuses it before pasting so the result lands in the ORIGINAL window), `cancelCurrent` + a **⌘+Escape** shortcut registered only while a refine runs, all `ipcMain.handle(...)` handlers (incl. `confirm-delete-prompt`), `autoUpdater`.
- `src/settingsStore.js` — persists settings to `config.json` in userData. `DEFAULTS` (default model = `claude-opus-4-8`, default `effort` = `high`), `RETIRED_MODELS` (redirect map for dead model IDs — now empty; Fable 5 is a live model), `PERSIST_KEYS` (the privacy allowlist — the ONLY keys ever written to disk; includes `sound` + `effort`), `safeStorage` API-key encryption.
- `src/transform.js` — the Anthropic API call. Sends `thinking:{type:'adaptive'}` + the **user-selected `output_config.effort`** (Settings → Effort Level; default high) for `claude-opus*` / `claude-sonnet*` / `claude-fable*`; nothing for Haiku (rejects effort). Takes an `effort` arg + an AbortController (`callModel(cfg,text,ac)`) so ⌘+Escape can cancel. Holds input + output in memory only — never logs/persists.
- `src/paste.js` — synthetic copy/paste keystrokes (osascript on macOS). `getFrontmostApp()` / `activateApp()` (via `execFile`, no shell; bundle-id regex-restricted; 1.5s timeout) capture the frontmost app at ⌘L and re-focus it before pasting.
- `src/preload.js` — the `window.polish` bridge (contextIsolation on).
- `src/loading.html` + `src/loading.js` — the transparent spinner window ("Polishing…" pill): fade-in on show, fade-out + `pop-out.wav` on finish; entrance plays `pop-in.wav`. CSP is tight (`script-src 'self'; media-src 'self'`); the spinner `BrowserWindow` sets `autoplayPolicy:'no-user-gesture-required'`.
- `src/settings.html` + `src/settings.css` + `src/settings.js` — the Settings card UI: API key, Shortcut, **Model** dropdown, **Effort Level** dropdown (Low/Medium/High/Extra high/Max; greyed out for Haiku), **Sound** toggle, **Prompts** (collapsed = row only; expand for the editor; delete asks a native confirm). Cards built in JS; window auto-fits its content height.
- `src/pop-in.wav` / `src/pop-out.wav` — bundled spinner sounds (extracted from reference videos with ffmpeg, full natural decay + smooth tail).
- `package.json` — version, `build` config (electron-builder: `notarize`, `files` allowlist, publish target).
- `.github/workflows/release.yml` — the CI build/sign/notarize/publish pipeline.
- Dormant, excluded from builds (files allowlist): `src/claudeCode.js`, `src/relayServer.js`, `src/relayClient.js`, `src/tunnel.js`. `web/` is a separate standalone server (`npm run web`).

## Conventions
- **Versioning:** semver in `package.json`; each shippable change bumps the patch (…7.0.35, 7.0.36…). One feature per version.
- **Ship flow:** build as a signed(+notarized) release via CI → download the dmg → Cherish installs & tests → publish **only on her explicit "publish"**. Don't publish proactively.
- **Commits** end with `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **Download release assets into `/Users/cherishmei/Desktop/Claude`** — the sandbox/TCC blocks `~/Downloads`.

## Rules & recurring gotchas (project-specific)
- **PRIVACY — never persist refined text.** The app must never save the text being refined or Claude's output. Enforced by the `PERSIST_KEYS` allowlist in `settingsStore.js`: `config.json` is the only disk write and holds only settings + the encrypted API key. README has a "Privacy & security" section. Never add logging/persistence of refined text.
- **Notarization needs Apple's Developer Program License Agreement to be current.** If CI's notarize step 403s ("agreement missing or has expired"), the account holder must re-accept it at developer.apple.com — signing still works, only notarization fails. It's an account issue, not code.
- **Never publish a non-notarized build as Latest / non-prerelease** — installed apps auto-update to it and macOS may block the updated copy. Non-notarized builds go out as **pre-releases** only.
- **Verify UI in Electron with Playwright's `_electron` launcher (not a browser), and ALWAYS pass `--user-data-dir=<temp>`** — the installed Polish.app holds the single-instance lock and (case-insensitive FS) its userData collides with the dev build's, so a dev launch otherwise quits instantly. Measure, don't eyeball. **If the launch fails with "Process failed to launch" and the app crashed with `app` undefined at `requestSingleInstanceLock`, strip `ELECTRON_RUN_AS_NODE` from the env you pass to `_electron.launch`** (`const e={...process.env}; delete e.ELECTRON_RUN_AS_NODE; ... env:e`) — when that var is set (it was in one session), Electron runs as plain Node and `require('electron').app` is undefined.
- **macOS Accessibility permission** is required to copy the selection + paste the result, and is tied to the code signature — a same-cert update preserves it; an identity change forces a re-grant.
- **Selection capture** fires a synthetic ⌘C but first waits ~150ms for the user's shortcut keys to lift (strict apps like Stickies reject a garbled combo), and retries once; paste-back is plain ⌘V.
- **Spinner window** is a transparent, frameless, always-on-top **`type:'panel'` (NSPanel)** window so it can draw over other apps' fullscreen Spaces; needs `backgroundColor:'#00000001'` to composite over GPU apps; **never** `app.disableHardwareAcceleration()` (breaks transparent compositing). On finish it's kept alive ~950ms so the exit sound's tail isn't clipped.
