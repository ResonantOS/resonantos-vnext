# Browser-First Host

Intent citation: `docs/architecture/ADR-037-browser-first-chromium-resonantos.md`

This is the first runnable browser-first ResonantOS host. It launches the native CEF Chrome Runtime app in visible browser mode, loads the ResonantOS browser-layer extension, and loads Phantom from a local Chrome/Brave profile when available.

Run:

```bash
npm run browser-first:dev
```

Optional:

```bash
npm run browser-first:dev -- --url=https://resonantos.com/dao/
```

Profile state is stored under:

```text
~/ResonantOS_User/BrowserFirst/Profiles/main
```

This is now the product-direction prototype. Electron/Tauri browser surfaces and external Chrome sidecars are research paths only.
