# Chrome Web Store — Publishing Checklist

Work through this list top-to-bottom before and during the submission process.
Check each item off as you complete it.

---

## Pre-Submission: Account & Legal

- [ ] **Chrome Web Store developer account created**
      https://chrome.google.com/webstore/devconsole
      One-time $5 USD registration fee required.

- [ ] **Developer account verified** — email verified, phone number added.

- [ ] **Privacy policy published** at a publicly accessible URL
      (e.g. https://resonantos.io/privacy).  Copy content from
      `webstore/PRIVACY-POLICY.md`.

- [ ] **Website live** at the URL you will list in the store.

---

## Pre-Submission: Assets

- [ ] `webstore/assets/icon-128.png` — 128 × 128 px PNG exists and reads
      clearly at 16 px scale.

- [ ] `webstore/assets/promo-tile-440x280.png` — 440 × 280 px PNG exists,
      no text is clipped by rounded-corner crop.

- [ ] At least one screenshot exists at `webstore/assets/screenshot-01.png`
      (1280 × 800 px or 640 × 400 px, PNG or JPEG).

- [ ] Optional: `webstore/assets/marquee-1400x560.png` if pursuing featured
      placement.

- [ ] Optional: YouTube promo video published and URL noted:
      `_________________________________`

See `webstore/assets/REQUIRED-ASSETS.md` for design guidance on each asset.

---

## Pre-Submission: Extension Package

- [ ] **Run the packager script** to confirm a clean build:
      ```bash
      cd ~/resonantos-vnext/browser-first
      bash package-extension.sh
      ```
      Confirm: no errors, `manifest.json` present in zip output.

- [ ] **Output zip exists:** `dist/resonantos-browser-layer-v{version}.zip`

- [ ] **Version number in manifest.json is correct** for this release.
      Edit `resonantos-side-panel-extension/manifest.json` → `"version"` field.

- [ ] **No development-only code** in the zip (no console.log spam, no
      localhost-only endpoints hardcoded in user-facing paths).

- [ ] **No source maps in zip** (already excluded by package-extension.sh).

- [ ] **No markdown or shell scripts in zip** (already excluded by
      package-extension.sh).

---

## Pre-Submission: Native Messaging Host

- [ ] **Bridge daemon runs cleanly** on a fresh machine (test on a clean
      user account or VM).

- [ ] **install-native-host.sh tested** on macOS and/or Linux:
      ```bash
      cd ~/resonantos-vnext/browser-first/native-messaging
      bash install-native-host.sh
      ```
      Confirm: manifest copied to correct Chrome/Brave directories, no errors.

- [ ] **Extension detects bridge** — load the unpacked extension, open a page,
      confirm the side panel shows "Bridge connected" status.

- [ ] **Extension gracefully handles missing bridge** — confirm the
      "Install the ResonantOS bridge" notification appears when bridge is not
      running.

---

## Submission: Chrome Web Store Developer Console

- [ ] Log in to https://chrome.google.com/webstore/devconsole

- [ ] Click **"New Item"** → upload `dist/resonantos-browser-layer-v{version}.zip`

- [ ] **Store listing → Name:**
      `ResonantOS Browser Layer`

- [ ] **Store listing → Short description:**
      ```
      AI strategist sidebar for Web3. Reads pages, assists trades, manages memory. Pairs with Phantom wallet. Human-approval gated.
      ```
      (Copy from `webstore/LISTING.md` — verify ≤ 132 characters)

- [ ] **Store listing → Detailed description:**
      Paste full text from `webstore/LISTING.md` → Detailed Description section.

- [ ] **Store listing → Category:** `Productivity`

- [ ] **Store listing → Language:** `English`

- [ ] **Store listing → Website:** `https://resonantos.io`

- [ ] **Store listing → Support URL:** `https://resonantos.io/support`

- [ ] **Store listing → Privacy policy URL:** `https://resonantos.io/privacy`

- [ ] **Upload icon:** `webstore/assets/icon-128.png`

- [ ] **Upload promotional tile:** `webstore/assets/promo-tile-440x280.png`

- [ ] **Upload screenshots:** at least `screenshot-01.png`, up to 5 total.

- [ ] **Upload marquee** (optional): `webstore/assets/marquee-1400x560.png`

- [ ] **Add YouTube video URL** (optional).

---

## Submission: Privacy Practices Tab

- [ ] Answer **"Does your extension handle user data?"** — select appropriate
      data types based on `webstore/PRIVACY-POLICY.md` and
      `webstore/REVIEW-NOTES.md`.

- [ ] Certify that the extension complies with the Chrome Web Store
      Developer Program Policies.

- [ ] Check the box confirming the privacy policy URL is accurate.

---

## Submission: Review Notes (optional field in console)

- [ ] Paste the summary from `webstore/REVIEW-NOTES.md` Section 3
      (AI Call Routing) into the "Notes for reviewer" field to proactively
      explain the local bridge architecture.  This significantly reduces
      review questions.

---

## After Submission

- [ ] **Monitor review status** in the developer console.
      Typical review time: **1–3 business days** for new extensions.
      Complex permissions (host_permissions) sometimes trigger manual review
      adding 1–5 additional business days.

- [ ] **Watch for reviewer email** at the address on the developer account.
      Reviewers may request clarification — respond promptly (within 24 hours
      if possible).

- [ ] **If rejected:**
      - Read the rejection reason carefully.
      - Common reasons for this extension type: broad `host_permissions`
        needing better justification, or AI-related policy questions.
      - Refer to `webstore/REVIEW-NOTES.md` for the pre-written justification
        for each permission.
      - Resubmit within 7 days if possible.

---

## After Approval

- [ ] **Publish the extension** (approval ≠ automatic publish — you must click
      Publish in the console).

- [ ] **Announce** the install link on:
      - [ ] Discord community: https://discord.gg/resonantos
      - [ ] GitHub repository README
      - [ ] Twitter/X
      - [ ] Any DAO governance forum

- [ ] **Note the public install URL:**
      `https://chrome.google.com/webstore/detail/resonantos-browser-layer/{EXTENSION_ID}`
      (ID will be assigned at first publish)

- [ ] **Update native-messaging manifest** with the final extension ID if it
      changed during review (currently set to `cdpdmmalhmokbfcfgogoepnjplaakgnl`
      derived from the `key` field in manifest.json).

- [ ] **Tag the Git release:**
      ```bash
      git tag v0.1.0-webstore
      git push origin v0.1.0-webstore
      ```

---

## Version Update Process (for future releases)

1. Increment `"version"` in `manifest.json`.
2. Run `bash package-extension.sh`.
3. Upload new zip in developer console → **"Package"** tab.
4. Update store listing if features changed.
5. Submit for review.
6. Publish after approval.
