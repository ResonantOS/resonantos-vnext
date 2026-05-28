import {
  parseAutonomousBrowserActionIntent,
  parseClickIntent,
  parseControlIntent,
  parseFormsIntent,
  parseNaturalBrowserIntent,
  parseNaturalSearchIntent,
  parseReadPageIntent,
  parseScrollIntent,
  parseStructuredPageEditIntent,
  parseTypeIntent
} from "./browser-command-parser.js";

export function createSidePanelCommandRouter(handlers) {
  async function respondToCommand(value) {
    await handlers.bindMentionedTab(value);
    const slash = /^\/\s*([a-z]+)(?:\s+([\s\S]*))?$/i.exec(value.trim());
    if (slash) {
      const name = slash[1].toLowerCase();
      const body = (slash[2] ?? "").trim();
      if (name === "goal") return handlers.runGoalCommand(body);
      if (name === "hermes") return handlers.runDelegateCommand(`hermes ${body}`);
      if (name === "delegate") return handlers.runDelegateCommand(body);
      if (name === "status") return handlers.runStatusCommand();
      if (name === "site") return handlers.runSitePermissionCommand(body);
      if (name === "memory") return handlers.runMemorySearchCommand(body);
      if (name === "history") return handlers.runHistorySearchCommand(body);
      if (name === "capabilities" || name === "permissions") return handlers.runCapabilitiesCommand();
      if (name === "jobs") return handlers.runJobsCommand(body);
      if (name === "pause") return handlers.pauseBrowserJob(body);
      if (name === "resume") return handlers.resumeBrowserJob(body);
      if (name === "cancel") return handlers.cancelBrowserJob(body);
      if (name === "browser") return handlers.runBrowserCommand(body);
      if (name === "control") return handlers.runControlCommand(body);
    }

    const controlIntent = parseControlIntent(value);
    if (controlIntent) return handlers.runControlCommand(controlIntent.goal);

    const typeIntent = parseTypeIntent(value);
    if (typeIntent) return handlers.typeIntoActivePage(typeIntent);

    const clickIntent = parseClickIntent(value);
    if (clickIntent) return handlers.clickActivePageText(clickIntent);

    const readPageIntent = parseReadPageIntent(value);
    if (readPageIntent) return handlers.summarizeSnapshot();

    const scrollIntent = parseScrollIntent(value);
    if (scrollIntent) return handlers.scrollActivePage(scrollIntent);

    const formsIntent = parseFormsIntent(value);
    if (formsIntent) return handlers.detectActivePageForms();

    const structuredEditIntent = parseStructuredPageEditIntent(value);
    if (structuredEditIntent) return handlers.explainStructuredPageEditBoundary(structuredEditIntent.instruction);

    const searchIntent = parseNaturalSearchIntent(value);
    if (searchIntent) return handlers.searchBrowser(searchIntent);

    const autonomousBrowserActionIntent = parseAutonomousBrowserActionIntent(value);
    if (autonomousBrowserActionIntent) return handlers.runControlCommand(autonomousBrowserActionIntent.goal);

    const browserIntent = parseNaturalBrowserIntent(value);
    if (browserIntent) return handlers.openBrowserUrl(browserIntent.target);

    if (/^\/(read|context)\b/i.test(value) || /^\/(summari[sz]e)\b/i.test(value)) {
      return handlers.summarizeSnapshot();
    }

    if (/^\/(save|archive|intake)\b/i.test(value)) {
      return handlers.saveIntake();
    }

    if (/wallet|phantom|seed phrase|private key/i.test(value)) {
      return handlers.handleWalletBoundary();
    }

    return handlers.runChatTurn();
  }

  return {
    respondToCommand
  };
}
