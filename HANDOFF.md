# Polish — Session Handoff

*Point-in-time snapshot to resume in a fresh chat. For durable project context, also read `CLAUDE.md` in this same folder. Last updated: 2026-07-20.*

---

## Project

- **What it is:** "Polish" — a macOS/Windows **menu-bar/tray Electron app** (no main window). Select text anywhere → global shortcut (default **⌘L**) → selection sent to Claude with the active prompt → refined result pasted back in place. Settings window: API key, model, Effort Level, editable prompts, shortcut, Sound toggle.
- **Folder (absolute):** `/Users/cherishmei/Desktop/Claude/polish`
- **Git:** **`https://github.com/cherish-mei/polish`** (remote `origin`), branch **`main`**, HEAD **`d3cc161`**, `package.json` version **`7.0.39`**. **Cherish is the sole owner** (transferred from `seantree2` on 2026-07-20; Sean removed as collaborator). `gh` in this environment is authed as **cherish-mei** (admin).
- **Deploy:** GitHub Actions `workflow_dispatch` → `gh workflow run release.yml --ref main --repo cherish-mei/polish` → `electron-builder` builds signed (+notarized when enabled) universal mac `.dmg` + Windows `.exe` → publishes a release. Installed apps auto-update via `electron-updater` (ignores pre-releases).
- **Public download / "live URL":** `https://github.com/cherish-mei/polish/releases` — **no passcode.** Repo is **public** (so James/Sean can download).
- **Latest build:** **v7.0.39** — signed-but-**NOT-notarized**, published as a **pre-release**. Direct dmg: `https://github.com/cherish-mei/polish/releases/download/v7.0.39/Polish-V7.0.39-universal.dmg`
- **Stack:** Electron 32 (Node, main process only) · `@anthropic-ai/sdk` (latest) · `electron-builder` 25 · `electron-updater` 6.8.9 · API key encrypted via `safeStorage`.

---

## Done this session

All committed + pushed to `cherish-mei/polish`. Verification is honest below.

| Change | Verified? |
|---|---|
| **Fable 5** added as a selectable model (`claude-fable-5`; un-retired in settingsStore) | ✅ Playwright: in dropdown, saves correctly. Real Fable *refine* still unproven (needs her key). |
| **Effort Level** selector under Model — Low / Medium / High / **Extra high** / Max, default High; greyed out for Haiku; sent as `output_config.effort` | ✅ Playwright: placement, select+persist, Haiku grey-out |
| **Paste back into the original window** even if the user switches apps mid-refine | ✅ component-level (`getFrontmostApp` returns the right app in ~190ms; wired in before paste). **End-to-end (switch windows mid-refine) still needs her real test.** |
| **⌘+Escape cancels** a running refine | ✅ abort machinery proven (aborted request stops in ~12ms; treated as cancel, not error). **Pressing the real shortcut mid-refine still needs her test.** |
| **Collapsed prompt card** no longer shows the preview box (collapsed = row only; expand = editor) | ✅ Playwright: no box collapsed, editor shows expanded |
| **Repo transferred** to `cherish-mei/polish` (sole owner, public), `publish.owner`→`cherish-mei`, local remote updated, all 6 Apple secrets transferred; **first build from her repo (v7.0.39) succeeded** | ✅ build green, signed with `Lodinos Pty Ltd (X6495SAQRN)` |

---

## In progress — RESUME HERE

**The app is feature-complete for this round and shipping from Cherish's own repo. The one open thread is notarization.**

- **v7.0.39 is the current build** — signed-but-not-notarized, pre-release. James installs it via the terminal route: download → drag to Applications → `xattr -dr com.apple.quarantine /Applications/Polish.app` → open. (Same cert as before, so Accessibility carries over.)
- **notarization is still OFF** (`"notarize": false` in package.json). Reason: Cherish **reuses Sean's Apple signing certificate**, so notarization needs the **Apple Developer Program License Agreement** accepted on **Sean's** Apple account — still pending. The repo move did NOT change this (same cert = same Apple account).
- **When Sean accepts the agreement (the clean finish):**
  1. Set `"notarize": true` in `package.json`.
  2. Bump version to **7.0.40**.
  3. `git push`, then `gh workflow run release.yml --ref main --repo cherish-mei/polish`, poll to `completed`.
  4. `gh release edit v7.0.40 --repo cherish-mei/polish --draft=false --latest` (publish as Latest).
  5. You, James, and Sean all **auto-update** to the clean notarized build — no terminal step. The pre-releases become irrelevant.

**Live values:** signing id `Developer ID Application: Lodinos Pty Ltd (X6495SAQRN)`; latest dmg link above; `gh` authed as cherish-mei.

---

## Pending

- **‼️ Sean accepts the Apple Program License Agreement** at https://developer.apple.com/account (his account — it holds the cert being reused). Unblocks a clean notarized release.
- **‼️ Then do the notarized release** (steps in "In progress" above) and **don't leave `notarize:false`**.
- **‼️ Cherish's real-world test** of the two behavioral features on v7.0.39: (a) start a refine, switch windows, confirm the result lands in the ORIGINAL window; (b) press **⌘+Escape** mid-refine, confirm it cancels + shows "Polish cancelled".
- Full independence from Sean (her **own** Apple Developer account + cert) is **deferred** — until then the signing key is shared with Sean even though the repo is solely hers.
- Optional: make Fable 5 the default model (currently Opus 4.8; Fable ≈ 2× cost) — not requested.

---

## Gotchas & rules

- **Notarization ≠ signing.** Signing works without the Apple agreement; notarization doesn't. Reusing Sean's cert → notarization still needs *Sean's* agreement even though the repo is Cherish's.
- **‼️ Never publish a non-notarized build as `--latest`/non-prerelease** — installed apps would auto-update to it and macOS could block the updated copy. Non-notarized → **pre-release only** (auto-update ignores pre-releases; `autoUpdater.checkForUpdatesAndNotify`, no `allowPrerelease`).
- **Same signing cert = Accessibility (TCC) permission persists.** Keep Team `X6495SAQRN`.
- **‼️ Verify with Playwright `_electron` (NOT a browser), ALWAYS `--user-data-dir=<temp>` AND strip `ELECTRON_RUN_AS_NODE` from the env** — this session's env had `ELECTRON_RUN_AS_NODE=1` set, which makes Electron run as plain Node and crash on launch ("Process failed to launch", `app` undefined at `requestSingleInstanceLock`). Pattern: `const e={...process.env}; delete e.ELECTRON_RUN_AS_NODE; _electron.launch({..., env:e})`. Also: the installed Polish.app holds the single-instance lock, so the temp user-data-dir is mandatory.
- **Build from `cherish-mei/polish`** — `gh workflow run release.yml --ref main --repo cherish-mei/polish`. Poll `gh run view <id> --repo cherish-mei/polish --json status` to `completed` before downloading. CI publishes a draft; `gh release edit ... --draft=false [--prerelease|--latest]` finalizes.
- **Non-notarized builds:** after building, `gh release edit vX --draft=false --prerelease --latest=false`, then hand the direct dmg link to James (terminal route). This keeps auto-update untouched.
- **Downloads:** TCC blocks `~/Downloads` → save release assets into `/Users/cherishmei/Desktop/Claude`.
- **Desktop/Claude gets reorganized** (old dmgs moved to `_archive/`, `_reorg-trash-*`) — the GitHub release URL is the canonical download, not any local path.
- **Git:** `git pull --rebase origin main` before pushing. Commits end `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- **PRIVACY (hard user requirement):** the app never saves refined text — `PERSIST_KEYS` allowlist in `settingsStore.js` (`config.json` is the only disk write; settings + encrypted key only).
- **How "done" is verified:** build → Cherish installs/tests → publish only on her explicit go. UI verified by Playwright, measured not eyeballed.
- **Cherish's prefs** (`~/.claude/CLAUDE.md`): plain language; ‼️ on action items; send the exact link after every build; end replies with a do-now / waiting checklist; quality over cost; show each section as you go.

---

## Resume by

**Ask Cherish whether Sean has accepted the Apple Developer Program License Agreement.** If **yes** → set `notarize:true`, bump to `7.0.40`, build from `cherish-mei/polish`, publish as `--latest` → everyone auto-updates to a clean notarized build. If **no** → she keeps distributing the v7.0.39 pre-release link (terminal route), and there's nothing blocking day-to-day use.

*This file: `/Users/cherishmei/Desktop/Claude/polish/HANDOFF.md`*
