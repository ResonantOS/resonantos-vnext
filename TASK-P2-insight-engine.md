# Task P2: Insight Engine Add-on (Sherlock Reborn)

## Context
The Linus Review identified a missing "reasoning layer" — no system analyzes patterns across Living Archive content over time. This task creates an `addon.insight-engine` add-on that performs LLM-powered cross-document pattern analysis.

## Current Architecture
- Add-ons are defined by JSON manifests validated by `src/sdk/addons/validation.ts`
- Add-on manifests declare capabilities, surfaces, runtime type
- Memory-provider broker in `src/core/memory-provider.ts` provides search/read/intake operations
- Add-on contracts in `src/sdk/addons/contracts.ts`
- Existing add-on examples: `addons/resonant-browser-host/`, `addons/resonant-browser-native/`

## Specification

### 1. Create add-on manifest: `addons/insight-engine/manifest.json`
```json
{
  "id": "addon.insight-engine",
  "name": "Insight Engine",
  "version": "0.1.0",
  "author": "ResonantOS",
  "category": "knowledge",
  "sdkVersion": "0.1.0",
  "description": "Cross-document pattern analysis and proactive insight generation powered by LLM reasoning over Living Archive content.",
  "runtimeType": "local-service",
  "surfaces": [
    {
      "type": "panel",
      "id": "insight-panel",
      "label": "Insights",
      "entryPoint": "insight-panel"
    }
  ],
  "requestedCapabilities": [
    { "capability": "archive-read", "granted": false, "scope": "workspace", "revocationBehavior": "hard-stop" },
    { "capability": "provider-routing", "granted": false, "scope": "self", "revocationBehavior": "degrade" }
  ],
  "systemSlots": [],
  "providerRequirements": {
    "sharedProfiles": [],
    "supportsPrivateCredentials": false
  }
}
```

### 2. Create add-on module: `src/modules/insight-engine/`
Create `src/modules/insight-engine/controller.ts`:
- `runInsightAnalysis(state, dispatch)` — main analysis function
  - Calls `broker.search()` with broad queries to get recent archive content
  - Calls `broker.status()` to get archive stats
  - Groups pages by domain/type for pattern analysis
  - Constructs structured LLM prompt with retrieved content
  - Sends to provider via existing chat execution path
  - Parses structured response into insight objects
  - Returns `InsightResult[]`

Create `src/modules/insight-engine/types.ts`:
```typescript
export interface Insight {
  id: string;
  type: 'pattern' | 'anomaly' | 'connection' | 'suggestion';
  title: string;
  description: string;
  confidence: number; // 0-1
  evidence: { pageId: string; title: string; excerpt: string }[];
  createdAt: string;
  dismissed: boolean;
}

export interface InsightAnalysisResult {
  insights: Insight[];
  pagesAnalyzed: number;
  analysisModel: string;
  durationMs: number;
}
```

Create `src/modules/insight-engine/prompts.ts`:
- `buildPatternAnalysisPrompt(pages, stats)` — constructs the LLM prompt
- Prompt template asks the LLM to:
  1. Identify recurring themes across documents
  2. Detect anomalies or gaps in knowledge
  3. Find connections between seemingly unrelated topics
  4. Suggest areas for investigation
  5. Return structured JSON response

### 3. Tests
Create `src/modules/insight-engine/insight-engine.test.ts`:
- Test `buildPatternAnalysisPrompt` produces valid prompt with page content
- Test insight type parsing handles all 4 types
- Test confidence scoring is clamped to 0-1
- Test empty archive returns empty insights (not error)

### 4. Manifest validation test
Add to existing `src/sdk/addons/validation.test.ts` or create separate test:
- Test that `addons/insight-engine/manifest.json` passes `validateAddOnManifest()`

## Test Command
```bash
cd ~/resonantos-vnext && npm run test -- --run
```

## Scope
- New: `addons/insight-engine/manifest.json`
- New: `src/modules/insight-engine/controller.ts` (~150 lines)
- New: `src/modules/insight-engine/types.ts` (~30 lines)
- New: `src/modules/insight-engine/prompts.ts` (~80 lines)
- New: `src/modules/insight-engine/insight-engine.test.ts` (~100 lines)
