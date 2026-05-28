# Chrome Web Store — Required Visual Assets

This document lists every visual asset you must produce before submitting the
ResonantOS Browser Layer to the Chrome Web Store.  None of these are generated
automatically — a human designer (or image-generation tool) must produce them
and place the finished files alongside this document.

---

## 1. Extension Icon — 128 × 128 px PNG

| Field       | Value                          |
|-------------|--------------------------------|
| File name   | `icon-128.png`                 |
| Dimensions  | 128 × 128 pixels               |
| Format      | PNG (transparency allowed)     |
| Where used  | Chrome Web Store listing page, extension toolbar (scaled), install prompts |

### Design guidance
- Use the angular robot from the *Analog 6* paperback cover as the primary motif
  (yellow eyes, red articulated hand, mustard-gold background).
- The icon should read clearly at 16 × 16 after scaling — keep the silhouette bold.
- A dark-background variant performs better in dark-mode Chrome toolbars; consider
  offering one as `icon-128-dark.png` for reference even though only one is uploaded.
- **Do NOT include text in the icon** — Chrome trims it at small sizes.

---

## 2. Promotional Tile — 440 × 280 px PNG

| Field       | Value                          |
|-------------|--------------------------------|
| File name   | `promo-tile-440x280.png`       |
| Dimensions  | 440 × 280 pixels               |
| Format      | PNG                            |
| Where used  | Small promotional tile on the Web Store category pages |

### Design guidance
- Show the ResonantOS name + tagline: *"AI strategist sidebar for Web3"*
- Robot icon anchored left; text on the right on a dark (near-black or deep navy)
  background to match the Analog 6 aesthetic.
- Leave ~8 px clear margin on all edges — the store crops rounded corners.
- Avoid white backgrounds; they look broken in dark-mode store views.

---

## 3. Marquee Banner — 1400 × 560 px PNG  *(optional but recommended)*

| Field       | Value                          |
|-------------|--------------------------------|
| File name   | `marquee-1400x560.png`         |
| Dimensions  | 1400 × 560 pixels              |
| Format      | PNG                            |
| Where used  | Featured placement at top of category page (only appears if Google manually features the extension) |

### Design guidance
- Same visual language as promo tile, more real estate for a screenshot or UI
  mockup integrated into the composition.
- The robot and the side-panel UI side-by-side works well here.

---

## 4. Screenshots — 1280 × 800 px PNG  *(at least 1, up to 5)*

| Field       | Value                                          |
|-------------|------------------------------------------------|
| File names  | `screenshot-01.png` … `screenshot-05.png`      |
| Dimensions  | 1280 × 800 px **or** 640 × 400 px              |
| Format      | PNG or JPEG                                    |
| Where used  | Screenshot carousel on the store listing page  |

### Recommended shots (in order)
1. **Side panel open** — Chrome browser with a DeFi/NFT page active and the
   ResonantOS panel visible on the right, showing Augmentor suggestions.
2. **Approval gate** — the human-approval dialog intercepting a wallet_sign action.
3. **Memory context** — Living Archive section with a few context cards visible.
4. **Phantom wallet flow** — panel showing wallet status after pairing.
5. **Settings / bridge status** — bridge health indicator showing "Connected to
   local bridge on port 47773".

### Production tips
- Use a real Chrome window; fake mockup screenshots are sometimes rejected.
- Blur or redact any personal wallet addresses, private keys, or real URLs.
- Add a thin frame/device chrome around the screenshot to give context.

---

## 5. Promotional Video — optional

| Field       | Value                                              |
|-------------|----------------------------------------------------|
| Where used  | YouTube link shown on the store listing page       |
| Recommended | 60–90 second screen-capture walkthrough            |

### Suggested script outline
1. (0–10 s) Install extension, icon appears in toolbar
2. (10–30 s) Open a DeFi page, side panel auto-opens, Augmentor analyses page
3. (30–50 s) Attempt a wallet action → approval gate fires → human approves → action executes
4. (50–70 s) Living Archive context card surfaced from memory
5. (70–90 s) Bridge health panel; settings walkthrough

---

## Asset Checklist

- [ ] `icon-128.png` — created and reviewed at 16 px scaled size
- [ ] `promo-tile-440x280.png` — contrast passes WCAG AA
- [ ] `marquee-1400x560.png` — optional, created if pursuing featured placement
- [ ] `screenshot-01.png` through `screenshot-05.png` — at least 1 required
- [ ] YouTube promo video link — optional

Place finished files in this directory (`webstore/assets/`) before running the
publish checklist.
