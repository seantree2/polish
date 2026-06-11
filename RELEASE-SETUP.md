# Polish — automated releases & auto-update setup

Goal: push a new version → it's built, signed, **notarized**, and published →
every installed app **updates itself**. After the one-time setup below, releasing
is just bumping the version number.

## How it fits together
- The app contains `electron-updater` (already wired in `src/main.js`). On launch
  it checks **GitHub Releases** for a newer version, downloads it, and installs on quit.
- `.github/workflows/release.yml` builds Windows + macOS, signs+notarizes the Mac
  build, and publishes the installers + update metadata to a GitHub Release.

## ⚠️ Two one-time decisions/setups required

### 1. Releases must be in a PUBLIC location
Auto-update fetches from GitHub Releases. The app **cannot** read releases from a
**private** repo without embedding a secret token (insecure). So either:
- **(a)** Make `seantree2/polish` public, or
- **(b)** Create a dedicated **public** repo (e.g. `seantree2/polish-releases`) for
  installers and point `build.publish` (in `package.json`) + the `release.yml`
  publish target at it. Source stays private.

Until this is done, auto-update has nowhere to read from (the app just checks and
finds nothing — harmless, but no updates flow).

### 2. Add these GitHub Actions secrets (for the Mac notarized build)
`Settings → Secrets and variables → Actions → New repository secret`:

| Secret | What it is |
|---|---|
| `APPLE_ID` | Apple ID email of the Developer account |
| `APPLE_APP_SPECIFIC_PASSWORD` | app-specific password (appleid.apple.com → Sign-In & Security) |
| `APPLE_TEAM_ID` | 10-char Team ID (developer.apple.com → Membership) |
| `MAC_CERT_P12_BASE64` | "Developer ID Application" cert exported as `.p12`, base64-encoded:<br>`base64 -i cert.p12 \| pbcopy` (run on a Mac) |
| `MAC_CERT_PASSWORD` | the password used when exporting the `.p12` |
| `KEYCHAIN_PASSWORD` | any throwaway password for the CI keychain |

> The cert + password come from your teammate's Apple Developer account (he exports
> the Developer ID Application cert from Keychain Access → export as `.p12`).

## Cutting a release (after setup)
1. Bump `"version"` in `package.json` (e.g. `1.0.0` → `1.0.1`).
2. Commit, then tag and push:
   ```
   git tag v1.0.1
   git push origin v1.0.1
   ```
   (or run the **Release** workflow manually from the Actions tab)
3. CI builds + signs + notarizes + publishes. Installed apps update themselves.

## Important notes
- **Verification pass needed:** CI notarization always needs one real run to shake
  out (cert type, keychain, notarytool). Expect to tweak `release.yml` once the
  secrets are in and you do the first real release. This is normal.
- **One final manual install:** the apps currently installed don't contain the
  auto-updater. Users install the first auto-update-enabled (notarized) version
  **once**, manually. Every release after that is automatic.
- macOS auto-update **requires** signed + notarized builds — that's why notarization
  must be automated here, not done by hand each time.
