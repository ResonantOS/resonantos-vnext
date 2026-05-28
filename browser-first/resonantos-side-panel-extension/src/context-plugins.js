/**
 * Resonant Context — Domain Plugin Configs
 * Maps well-known domains to rich section/form/overlay selectors.
 * Used by content.js to initialize the SDK with domain-aware tracking.
 */

// ── Shared overlay selectors (used across all plugins) ──────────────────────
const UNIVERSAL_OVERLAYS = [
  "[role='dialog']",
  ".modal",
  "[class*='modal']",
  "[class*='overlay']",
  "[class*='popup']",
  "[class*='drawer']",
  "[data-radix-popper-content-wrapper]",
];

// ── Helper: build a plugin with a wildcard page match ───────────────────────
function buildPlugin(domain, sections, forms, extraOverlays) {
  const overlaySelectors = UNIVERSAL_OVERLAYS.concat(extraOverlays || []);
  return {
    domain: domain,
    overlaySelectors: overlaySelectors,
    clickSelectors: 'a, button, [onclick], [role="button"], [role="tab"], [role="menuitem"], [role="option"]',
    maxHistory: 20,
    maxClicks: 30,
    persistSession: true,
    // Single wildcard page that matches every path on this domain
    pages: {
      all: {
        match: function () { return true; },
        sections: sections,
        overlaySelectors: overlaySelectors,
        forms: forms || [],
      },
    },
  };
}

// ── Jupiter DEX (jup.ag) ─────────────────────────────────────────────────────
var PLUGIN_JUPITER = buildPlugin(
  "jup.ag",
  [
    { selector: ".swap-form, [class*='swap-container'], [class*='SwapForm']", label: "Swap Form", priority: 10 },
    { selector: "[class*='connect'], [class*='wallet-button']", label: "Connect Wallet", priority: 9 },
    { selector: "[class*='portfolio'], [class*='Portfolio']", label: "Portfolio", priority: 7 },
    { selector: "[class*='token-list'], [class*='TokenList'], [class*='trending']", label: "Token List", priority: 5 },
    { selector: "[class*='chart'], [class*='Chart'], [class*='TradingView']", label: "Price Chart", priority: 6 },
    { selector: "[class*='order-book'], [class*='OrderBook']", label: "Order Book", priority: 5 },
    { selector: "[class*='stats'], [class*='Stats'], [class*='market-stats']", label: "Market Stats", priority: 4 },
  ],
  [
    {
      selector: "[class*='swap'], [class*='Swap']",
      name: "Swap Form",
      priority: 10,
      fields: [
        { selector: "input[inputmode='decimal'], input[type='number'], input[type='text'][class*='amount']", label: "Amount" },
      ],
    },
  ],
  ["[class*='SelectToken'], [class*='token-selector']"]
);

// ── Phantom Wallet (phantom.app / app.phantom.com) ───────────────────────────
var PLUGIN_PHANTOM = buildPlugin(
  "phantom.app",
  [
    { selector: "[class*='balance'], [class*='Balance']", label: "Balance", priority: 9 },
    { selector: "[class*='send'], [class*='Send']", label: "Send", priority: 8 },
    { selector: "[class*='receive'], [class*='Receive']", label: "Receive", priority: 7 },
    { selector: "[class*='swap'], [class*='Swap']", label: "Swap", priority: 8 },
    { selector: "[class*='activity'], [class*='Activity'], [class*='transaction']", label: "Activity", priority: 6 },
    { selector: "[class*='nft'], [class*='NFT'], [class*='collectible']", label: "NFTs", priority: 4 },
    { selector: "[class*='settings'], [class*='Settings']", label: "Settings", priority: 3 },
  ],
  [
    {
      selector: "[class*='send-form'], form[class*='send']",
      name: "Send Form",
      priority: 10,
      fields: [
        { selector: "input[placeholder*='address'], input[placeholder*='Address']", label: "Recipient Address" },
        { selector: "input[placeholder*='amount'], input[placeholder*='Amount']", label: "Amount" },
      ],
    },
  ]
);

// ── Raydium (raydium.io) ─────────────────────────────────────────────────────
var PLUGIN_RAYDIUM = buildPlugin(
  "raydium.io",
  [
    { selector: "[class*='swap'], [class*='Swap'], .swap-card", label: "Swap Panel", priority: 10 },
    { selector: "[class*='liquidity'], [class*='Liquidity']", label: "Liquidity", priority: 8 },
    { selector: "[class*='farm'], [class*='Farm'], [class*='yield']", label: "Farms / Yield", priority: 7 },
    { selector: "[class*='pool'], [class*='Pool']", label: "Pools", priority: 6 },
    { selector: "[class*='staking'], [class*='Staking']", label: "Staking", priority: 6 },
    { selector: "[class*='portfolio'], [class*='wallet']", label: "Portfolio", priority: 5 },
  ],
  [
    {
      selector: "[class*='swap'], .swap-card",
      name: "Swap",
      priority: 10,
      fields: [
        { selector: "input[class*='input'], input[type='number']", label: "Token Amount" },
      ],
    },
  ]
);

// ── Orca (orca.so) ───────────────────────────────────────────────────────────
var PLUGIN_ORCA = buildPlugin(
  "orca.so",
  [
    { selector: "[class*='swap'], [class*='Swap']", label: "Swap", priority: 10 },
    { selector: "[class*='pool'], [class*='Pool'], [class*='whirlpool']", label: "Whirlpools / Pools", priority: 8 },
    { selector: "[class*='position'], [class*='Position']", label: "Positions", priority: 7 },
    { selector: "[class*='wallet'], [class*='connect']", label: "Wallet", priority: 6 },
  ],
  [
    {
      selector: "[class*='swap-form'], [class*='swap-card']",
      name: "Swap Form",
      priority: 10,
      fields: [
        { selector: "input[type='number'], input[inputmode='decimal']", label: "Amount" },
      ],
    },
  ]
);

// ── GitHub (github.com) ──────────────────────────────────────────────────────
var PLUGIN_GITHUB = buildPlugin(
  "github.com",
  [
    { selector: "#readme, .markdown-body", label: "README / Content", priority: 8 },
    { selector: "[data-view-component='true'].diff-view, .file-diff", label: "Code Diff", priority: 10 },
    { selector: ".review-thread, .inline-comment", label: "Review Comments", priority: 9 },
    { selector: "#files_changed, [aria-label='Files changed']", label: "Files Changed", priority: 9 },
    { selector: ".commit-tease, .commit-meta", label: "Commit Info", priority: 7 },
    { selector: ".issues-list-item, #issue-title", label: "Issue / PR", priority: 8 },
    { selector: ".CodeMirror, .monaco-editor, [class*='code-editor']", label: "Code Editor", priority: 9 },
    { selector: ".file-header, [data-file-type]", label: "File View", priority: 7 },
    { selector: ".repo-stats, [aria-label='Repository stats']", label: "Repository Stats", priority: 4 },
  ],
  [
    {
      selector: "#new_comment_field, textarea[name='comment[body]'], .comment-form-textarea",
      name: "Comment Box",
      priority: 9,
      fields: [
        { selector: "textarea", label: "Comment" },
      ],
    },
    {
      selector: ".js-new-issue-form, #new_issue",
      name: "New Issue",
      priority: 10,
      fields: [
        { selector: "#issue_title", label: "Title" },
        { selector: "#issue_body", label: "Description" },
      ],
    },
    {
      selector: ".js-pull-request-review-form",
      name: "PR Review",
      priority: 10,
      fields: [
        { selector: "textarea.comment-form-textarea", label: "Review Comment" },
      ],
    },
  ],
  [".Overlay-backdrop", ".modal-backdrop"]
);

// ── Google Search / Docs / Sheets (google.com) ───────────────────────────────
var PLUGIN_GOOGLE = buildPlugin(
  "google.com",
  [
    // Search
    { selector: "#search, [role='main']", label: "Search Results", priority: 8 },
    { selector: "#searchform, form[role='search']", label: "Search Bar", priority: 9 },
    // Docs
    { selector: ".kix-page-content-wrapper, .docs-editor-container", label: "Document Content", priority: 9 },
    { selector: ".docsbar-container, .docs-title-outer", label: "Document Header", priority: 7 },
    // Sheets
    { selector: "#grid-container, .grid-container", label: "Spreadsheet Grid", priority: 9 },
    { selector: ".docs-sheet-tab-strip", label: "Sheet Tabs", priority: 5 },
    // Gmail
    { selector: ".nH.ar4.z0", label: "Email Thread", priority: 8 },
    { selector: ".dw.an, .compose-form", label: "Compose Email", priority: 9 },
    // Drive
    { selector: "[data-target='doc'], .r-ixnrzc", label: "Drive Files", priority: 7 },
  ],
  [
    {
      selector: "form[action*='search'], #tsf",
      name: "Search Form",
      priority: 10,
      fields: [
        { selector: "input[name='q'], textarea[name='q']", label: "Search Query" },
      ],
    },
  ],
  [".Tnsqgc", "[jsname='haAclf']"]
);

// ── Generic Fallback (*) ─────────────────────────────────────────────────────
var PLUGIN_GENERIC = buildPlugin(
  "*",
  [
    { selector: "main, [role='main'], #main, #content", label: "Main Content", priority: 5 },
    { selector: "article, .article, [role='article']", label: "Article", priority: 7 },
    { selector: "form", label: "Form", priority: 8 },
    { selector: "nav, [role='navigation']", label: "Navigation", priority: 2 },
    { selector: "header, [role='banner']", label: "Header", priority: 1 },
    { selector: "aside, [role='complementary']", label: "Sidebar", priority: 3 },
    { selector: "section[class*='hero'], .hero, [class*='banner']", label: "Hero / Banner", priority: 4 },
    { selector: "[class*='product'], [class*='listing']", label: "Product / Listing", priority: 6 },
    { selector: "[class*='price'], [class*='checkout'], [class*='cart']", label: "Pricing / Cart", priority: 9 },
    { selector: "[class*='table'], table", label: "Data Table", priority: 5 },
  ],
  [
    {
      selector: "form",
      name: "Page Form",
      priority: 5,
      fields: [
        { selector: "input[type='text'], input[type='email'], input[type='tel'], input[type='search'], textarea, select", label: "Field" },
      ],
    },
  ]
);

// ── Domain → Plugin registry ─────────────────────────────────────────────────
var _PLUGIN_REGISTRY = {
  "jup.ag":       PLUGIN_JUPITER,
  "www.jup.ag":   PLUGIN_JUPITER,
  "app.jup.ag":   PLUGIN_JUPITER,
  "phantom.app":  PLUGIN_PHANTOM,
  "app.phantom.com": PLUGIN_PHANTOM,
  "raydium.io":   PLUGIN_RAYDIUM,
  "app.raydium.io": PLUGIN_RAYDIUM,
  "orca.so":      PLUGIN_ORCA,
  "www.orca.so":  PLUGIN_ORCA,
  "github.com":   PLUGIN_GITHUB,
  "www.github.com": PLUGIN_GITHUB,
  "google.com":   PLUGIN_GOOGLE,
  "www.google.com": PLUGIN_GOOGLE,
  "docs.google.com": PLUGIN_GOOGLE,
  "sheets.google.com": PLUGIN_GOOGLE,
  "drive.google.com": PLUGIN_GOOGLE,
  "mail.google.com": PLUGIN_GOOGLE,
};

/**
 * Get the plugin config for a given hostname.
 * Falls back to the generic wildcard plugin if no exact or suffix match.
 * @param {string} hostname — location.hostname
 * @returns {Object} plugin config
 */
function getPluginForDomain(hostname) {
  if (!hostname) return PLUGIN_GENERIC;

  // 1. Exact match
  if (_PLUGIN_REGISTRY[hostname]) return _PLUGIN_REGISTRY[hostname];

  // 2. Subdomain suffix match (e.g. "swap.jup.ag" → PLUGIN_JUPITER)
  var domains = Object.keys(_PLUGIN_REGISTRY);
  for (var i = 0; i < domains.length; i++) {
    var domain = domains[i];
    if (hostname.endsWith("." + domain)) {
      return _PLUGIN_REGISTRY[domain];
    }
  }

  // 3. TLD parent match (e.g. "github.io" → loose match on "github")
  var hostBase = hostname.split(".").slice(-2).join(".");
  for (var j = 0; j < domains.length; j++) {
    if (domains[j].indexOf(hostBase) !== -1 || hostBase.indexOf(domains[j]) !== -1) {
      return _PLUGIN_REGISTRY[domains[j]];
    }
  }

  return PLUGIN_GENERIC;
}
