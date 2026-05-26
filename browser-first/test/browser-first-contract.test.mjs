import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import path from "node:path";
import test from "node:test";

const repoRoot = path.resolve(import.meta.dirname, "..", "..");
const browserFirstRoot = path.join(repoRoot, "browser-first");
const extensionRoot = path.join(browserFirstRoot, "resonantos-side-panel-extension");

const readJson = async (filePath) => JSON.parse(await readFile(filePath, "utf8"));
const readText = (filePath) => readFile(filePath, "utf8");

test("ADR-037 makes browser-first Chromium the product direction", async () => {
  const adr = await readText(path.join(repoRoot, "docs", "architecture", "ADR-037-browser-first-chromium-resonantos.md"));
  const adr035 = await readText(path.join(repoRoot, "docs", "architecture", "ADR-035-electron-host-rust-core-runtime.md"));
  const adr036 = await readText(path.join(repoRoot, "docs", "architecture", "ADR-036-wallet-capable-browser-host.md"));

  assert.match(adr, /browser-first application/i);
  assert.match(adr, /Chromium-family browser/i);
  assert.match(adr, /not a ResonantOS dashboard that opens or controls another browser/i);
  assert.match(adr, /Phantom Wallet must run in the same browser profile/i);
  assert.match(adr, /Do not present external Chrome\/Brave CDP control as the product Browser/i);
  assert.match(adr035, /Superseded by ADR-037/);
  assert.match(adr036, /Superseded by ADR-037/);
});

test("ResonantOS browser layer is packaged as a Chromium side-panel extension", async () => {
  const manifest = await readJson(path.join(extensionRoot, "manifest.json"));

  assert.equal(manifest.manifest_version, 3);
  assert.equal(manifest.name, "ResonantOS Browser Layer");
  assert.equal(manifest.version, "0.1.1");
  assert.equal(manifest.key.length > 100, true);
  assert.ok(manifest.permissions.includes("sidePanel"));
  assert.ok(manifest.permissions.includes("activeTab"));
  assert.ok(manifest.permissions.includes("clipboardRead"));
  assert.ok(manifest.permissions.includes("clipboardWrite"));
  assert.ok(manifest.permissions.includes("history"));
  assert.ok(manifest.permissions.includes("scripting"));
  assert.ok(manifest.permissions.includes("tabs"));
  assert.ok(manifest.permissions.includes("webNavigation"));
  assert.equal(manifest.content_scripts[0].all_frames, true);
  assert.equal(manifest.side_panel.default_path, "src/side-panel.html");
  assert.equal(manifest.background.type, "module");
  assert.equal(manifest.background.service_worker, "src/background.js");
  assert.equal(manifest.commands["open-augmentor-side-panel"].suggested_key.mac, "Alt+Shift+A");
});

test("browser layer has a human approval boundary for wallet and credential actions", async () => {
  const background = await readText(path.join(extensionRoot, "src", "background.js"));
  const panel = await readText(path.join(extensionRoot, "src", "side-panel.html"));
  const script = await readText(path.join(extensionRoot, "src", "side-panel.js"));

  assert.match(background, /wallet_connect/);
  assert.match(background, /wallet_sign/);
  assert.match(background, /credential_autofill/);
  assert.match(background, /deniedToAutomation/);
  assert.match(panel, /Message Augmentor/);
  assert.match(script, /Wallet actions are human-approval gated/);
});

test("browser layer exposes Augmentor chat as the side-panel surface without stealing the browser tab", async () => {
  const panel = await readText(path.join(extensionRoot, "src", "side-panel.html"));
  const script = await readText(path.join(extensionRoot, "src", "side-panel.js"));
  const bridgeClient = await readText(path.join(extensionRoot, "src", "lib", "bridge-client.js"));
  const commandParser = await readText(path.join(extensionRoot, "src", "lib", "browser-command-parser.js"));
  const approvalPolicy = await readText(path.join(extensionRoot, "src", "lib", "approval-policy.js"));
  const agentControlPlanner = await readText(path.join(extensionRoot, "src", "lib", "agent-control-planner.js"));
  const background = await readText(path.join(extensionRoot, "src", "background.js"));

  assert.match(panel, /Message Augmentor/);
  assert.match(panel, /bridge-config\.generated\.js/);
  assert.match(panel, /control-monitor/);
  assert.match(panel, /context-dock"[^>]+hidden/);
  assert.match(panel, /context-toggle/);
  assert.match(panel, /approval-card/);
  assert.match(panel, /approval-trust-site/);
  assert.match(panel, /site-permission-panel/);
  assert.match(panel, /job-monitor/);
  assert.match(panel, /trusted-for-safe-actions/);
  assert.doesNotMatch(panel, /I.m here in the browser side bar/);
  assert.doesNotMatch(panel, /Current page/);
  assert.match(panel, /Connected model/);
  assert.match(panel, /Thinking depth/);
  assert.match(panel, /Intake/);
  assert.match(background, /openPanelOnActionClick/);
  assert.match(background, /openResonantSidePanel/);
  assert.match(background, /open-augmentor-side-panel/);
  assert.doesNotMatch(background, /chrome\.tabs\.create/);
  assert.doesNotMatch(background, /chrome\.tabs\.onUpdated/);
  assert.match(script, /isReadableBrowserTab/);
  assert.match(script, /currentWindow: true/);
  assert.match(script, /summarizeSnapshot/);
  assert.match(script, /saveIntake/);
  assert.match(script, /createBridgeClient/);
  assert.match(bridgeClient, /bridgeUrl = config\.bridgeUrl \?\? "http:\/\/127\.0\.0\.1:47773"/);
  assert.match(bridgeClient, /__RESONANTOS_BRIDGE_CONFIG__/);
  assert.match(bridgeClient, /X-ResonantOS-Bridge-Token/);
  assert.match(script, /jobMonitorCollapsed = true/);
  assert.match(script, /\/augmentor\/chat/);
  assert.match(script, /\/archive\/intake/);
  assert.match(script, /\/memory\/search/);
  assert.match(script, /\/addons\/delegate/);
  assert.match(script, /\/goals/);
  assert.match(commandParser, /parseNaturalBrowserIntent/);
  assert.match(commandParser, /parseNaturalSearchIntent/);
  assert.match(commandParser, /parseTypeIntent/);
  assert.match(commandParser, /parseClickIntent/);
  assert.match(commandParser, /parseReadPageIntent/);
  assert.match(commandParser, /parseStructuredPageEditIntent/);
  assert.match(commandParser, /parseScrollIntent/);
  assert.match(commandParser, /parseFormsIntent/);
  assert.match(commandParser, /parseControlIntent/);
  assert.match(commandParser, /parseAutonomousBrowserActionIntent/);
  assert.match(commandParser, /parseAmazonShoppingTask/);
  assert.match(script, /runHistorySearchCommand/);
  assert.match(script, /runSitePermissionCommand/);
  assert.match(script, /runCapabilitiesCommand/);
  assert.match(script, /approvalBoundaryForStep/);
  assert.match(script, /controlStepLabel/);
  assert.match(agentControlPlanner, /planControlSteps/);
  assert.match(agentControlPlanner, /deterministicNextAction/);
  assert.match(agentControlPlanner, /dedupeControlSteps/);
  assert.match(agentControlPlanner, /controlStepLabel/);
  assert.match(script, /trustCurrentSiteForSafeActions/);
  assert.match(script, /runJobsCommand/);
  assert.match(script, /pauseBrowserJob/);
  assert.match(script, /resumeBrowserJob/);
  assert.match(script, /cancelBrowserJob/);
  assert.match(script, /augmentorBrowserJobs/);
  assert.match(script, /renderSitePermissionPanel/);
  assert.match(script, /sitePermissionMode\.addEventListener/);
  assert.match(script, /resolveTabMention/);
  assert.match(script, /augmentorInlineDraft/);
  assert.match(script, /searchBrowser/);
  assert.match(script, /typeIntoActivePage/);
  assert.match(script, /clickActivePageText/);
  assert.match(script, /scrollActivePage/);
  assert.match(script, /detectActivePageForms/);
  assert.match(script, /controlledTabId/);
  assert.match(script, /switch_tab/);
  assert.match(agentControlPlanner, /List open tabs/);
  assert.match(agentControlPlanner, /planControlSteps/);
  assert.match(script, /requestControlPlan/);
  assert.match(script, /requestNextControlAction/);
  assert.match(script, /continueControlLoop/);
  assert.match(script, /observe-act-verify-loop/);
  assert.match(approvalPolicy, /sanitizePlannerStep/);
  assert.match(approvalPolicy, /sanitizeNextActionDecision/);
  assert.match(approvalPolicy, /sanitizePlannerPlan/);
  assert.match(approvalPolicy, /approvalBoundaryForStep/);
  assert.match(script, /planAgentControlSteps/);
  assert.match(script, /__resonantosControlPlannerOverride/);
  assert.match(script, /__resonantosNextActionOverride/);
  assert.match(script, /executeControlStep/);
  assert.match(script, /runControlCommand/);
  assert.match(script, /renderControlMonitor/);
  assert.match(script, /approvePendingControlStep/);
  assert.match(script, /denyPendingControlStep/);
  assert.match(script, /saveControlReportToArchive/);
  assert.match(script, /delegateControlIssue/);
  assert.match(script, /Agent Control Mode started/);
  assert.match(script, /explainStructuredPageEditBoundary/);
  assert.match(script, /bing\.com\/news\/search/);
  assert.match(script, /\/web\/news/);
  assert.match(script, /turnBusy/);
  assert.match(script, /setActivity/);
  assert.match(script, /openBrowserUrl/);
  assert.match(script, /chrome\.tabs\.update/);
  assert.match(script, /chrome\.tabs\.create/);
  assert.match(script, /copyMessage/);
  assert.match(script, /commandInput\.addEventListener\("keydown"/);
  assert.match(script, /commandForm\.requestSubmit\(\)/);
  assert.match(script, /event\.metaKey/);
  assert.match(script, /undoComposerInput/);
  assert.match(script, /shortcutKey === "z"/);
  assert.match(script, /forkFromMessage/);
  assert.match(script, /editMessage/);
  assert.match(script, /saveMessageToArchive/);
  assert.match(script, /regenerateFromMessage/);
  assert.match(script, /deleteMessage/);
  assert.doesNotMatch(script, /Full LLM replies will come from/);
});

test("browser layer can read active tab context without raw privileged access", async () => {
  const content = await readText(path.join(extensionRoot, "src", "content.js"));
  const panel = await readText(path.join(extensionRoot, "src", "side-panel.js"));

  assert.match(content, /read_page/);
  assert.match(content, /click_text/);
  assert.match(content, /type_text/);
  assert.match(content, /resonantos-control-overlay/);
  assert.match(content, /control_overlay/);
  assert.match(content, /setControlSessionOverlay/);
  assert.match(content, /data-session="active"/);
  assert.match(content, /pulseControlOverlay/);
  assert.match(content, /resonantos-control-target/);
  assert.match(content, /userApproved/);
  assert.match(content, /isHardRestrictedElement/);
  assert.match(content, /scroll_page/);
  assert.match(content, /detect_forms/);
  assert.match(content, /clickVisibleText/);
  assert.match(content, /typeIntoPage/);
  assert.match(content, /scrollPage/);
  assert.match(content, /describeForms/);
  assert.match(content, /controls: candidateClickElements/);
  assert.match(content, /data-resonantos-control-ref/);
  assert.match(content, /resonantos-inline-assistant/);
  assert.match(content, /ros-inline-prompt/);
  assert.match(content, /data-action="custom"/);
  assert.match(content, /currentSitePermission/);
  assert.match(content, /augmentorInlineDraft/);
  assert.match(content, /ensureControlRef/);
  assert.match(content, /clickControlRef/);
  assert.match(content, /fields: Array\.from/);
  assert.match(content, /viewport/);
  assert.match(content, /approvalRequired/);
  assert.match(content, /document\.body\?\.innerText/);
  assert.match(content, /phantomSolana/);
  assert.match(panel, /chrome\.tabs\.sendMessage/);
  assert.match(panel, /chrome\.scripting/);
  assert.match(panel, /executeScript/);
  assert.match(panel, /chrome\.webNavigation/);
  assert.match(panel, /mergeFrameSnapshots/);
  assert.doesNotMatch(content, /eval\(/);
  assert.doesNotMatch(panel, /eval\(/);
});

test("browser-first host is a runnable app path, not documentation-only scaffolding", async () => {
  const packageJson = await readJson(path.join(repoRoot, "package.json"));
  const launcher = await readText(path.join(browserFirstRoot, "host", "run-browser-first.mjs"));
  const bridgeServer = await readText(path.join(browserFirstRoot, "host", "bridge-server.mjs"));
  const installer = await readText(path.join(repoRoot, "scripts", "install-browser-first-app.mjs"));
  const nativeHost = await readText(
    path.join(repoRoot, "addons", "resonant-browser-native", "native_host", "src", "resonant_browser_native_host.cc"),
  );

  assert.match(packageJson.scripts["browser-first:dev"], /run-browser-first\.mjs/);
  assert.match(packageJson.scripts["browser-first:install"], /install-browser-first-app\.mjs/);
  assert.match(installer, /ResonantOS Browser\.app/);
  assert.match(launcher, /--resonantos-browser-first/);
  assert.match(launcher, /resonantos-side-panel-extension/);
  assert.match(launcher, /bfnaelmomeimhlpmgjnjophhpkkoljpa/);
  assert.match(launcher, /pinned_extensions/);
  assert.match(launcher, /cdpdmmalhmokbfcfgogoepnjplaakgnl/);
  assert.match(launcher, /auto-open-side-panel/);
  assert.match(launcher, /remote-debugging-port/);
  assert.match(launcher, /resonantos-remote-debugging-port/);
  assert.match(launcher, /createBridgeToken/);
  assert.match(launcher, /writeBridgeConfig/);
  assert.match(launcher, /startBridgeServer/);
  assert.match(bridgeServer, /bridge-config\.generated\.js/);
  assert.match(bridgeServer, /X-ResonantOS-Bridge-Token/);
  assert.match(bridgeServer, /Unauthorized browser-first bridge request/);
  assert.doesNotMatch(bridgeServer, /Access-Control-Allow-Origin": "\*"/);
  assert.match(launcher, /provider-secrets\.json/);
  assert.match(launcher, /\/augmentor\/chat/);
  assert.match(launcher, /\/augmentor\/inline/);
  assert.match(launcher, /executeInlineAssistant/);
  assert.match(launcher, /customInstruction/);
  assert.match(launcher, /\/augmentor\/control-plan/);
  assert.match(launcher, /\/augmentor\/next-action/);
  assert.match(launcher, /executeNextAction/);
  assert.match(launcher, /sanitizeNextActionDecision/);
  assert.match(launcher, /switch_tab/);
  assert.match(launcher, /sanitizeControlStep/);
  assert.match(launcher, /sanitizeControlPlan/);
  assert.match(launcher, /executeControlPlan/);
  assert.match(launcher, /strict JSON only/);
  assert.match(launcher, /observed refs/);
  assert.match(launcher, /The web page remains in the main browser viewport/);
  assert.match(launcher, /host-mediated browser tools/);
  assert.match(launcher, /click visible page text/);
  assert.match(launcher, /\/memory\/status/);
  assert.match(launcher, /\/memory\/search/);
  assert.match(launcher, /\/archive\/intake/);
  assert.match(launcher, /\/addons\/delegate/);
  assert.match(launcher, /\/web\/news/);
  assert.match(launcher, /news\.google\.com\/rss/);
  assert.match(launcher, /keystroke \\"a\\" using \{option down, shift down\}/);
  assert.match(nativeHost, /resonantos-browser-first/);
  assert.match(nativeHost, /resonantos-remote-debugging-port/);
  assert.match(nativeHost, /CefKeyboardHandler/);
  assert.match(nativeHost, /EVENTFLAG_COMMAND_DOWN/);
  assert.match(nativeHost, /windows_key_code == 'Q'/);
  assert.match(nativeHost, /browser\.first\.started/);
  assert.match(nativeHost, /resonantos-user-data-dir/);
});

test("browser-first bridge rejects unauthenticated localhost requests", () => {
  const result = spawnSync(
    "node",
    [
      path.join(browserFirstRoot, "host", "run-browser-first.mjs"),
      "--bridge-auth-self-test=true",
      "--bridge-token=test-token",
      "--bridge-port=0",
    ],
    {
      cwd: repoRoot,
      encoding: "utf8",
      timeout: 10_000,
    },
  );

  assert.equal(result.status, 0, result.stderr || result.stdout);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.equal(payload.unauthorizedStatus, 401);
  assert.equal(payload.wrongTokenStatus, 401);
  assert.equal(payload.authorizedStatus, 200);
});
