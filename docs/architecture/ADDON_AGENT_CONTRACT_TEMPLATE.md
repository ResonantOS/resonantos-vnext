# Add-on Agent Contract Template

Status: SDK template  
Owner: ResonantOS add-on platform

## Purpose

Use this template when an add-on integrates an agent runtime, existing local agent installation, hosted dashboard, chat bridge, model selector, or Delegation target.

The goal is to make the integration testable before the human tries it manually.

## Manifest Link

The add-on manifest should include:

```json
{
  "install": {
    "mode": "detect-existing-or-install",
    "detectionTool": "<addon>.audit",
    "installTool": "<addon>.install",
    "requiredCapabilities": ["network", "shell"],
    "requiresHumanApprovalBeforeInstall": true,
    "preservesExistingUserConfig": true,
    "credentialSetup": "user-guided",
    "auditLogRequired": true,
    "expectedArtifacts": ["diagnostic-report", "log"]
  },
  "audit": {
    "tool": "<addon>.audit",
    "checks": ["command", "version", "runtime", "identity", "skills", "memory", "model"],
    "requiredCapabilities": ["shell"],
    "remediationPolicy": "approval-gated",
    "auditLogRequired": true
  },
  "embeddedWorkspace": {
    "surfaceId": "<addon>-workspace",
    "mode": "hosted-dashboard",
    "autoStart": true,
    "settingsVisibility": "hidden-collapsible",
    "healthTool": "<addon>.dashboard",
    "requiredCapabilities": ["shell", "ui-embedding"]
  },
  "agentRuntime": {
    "invocationTool": "<addon>.chat",
    "chatAuthorLabel": "<Agent Name>",
    "displayNameSource": "runtime-profile",
    "supportsStreaming": false,
    "supportsCancellation": true,
    "supportsModelSelection": true,
    "outputFiltering": "assistant-reply-only",
    "requiredCapabilities": ["shell", "providers"],
    "modelSelection": {
      "source": "runtime-audit",
      "currentModelField": "currentModel",
      "selectable": true,
      "changeTool": "<addon>.chat",
      "requiredCapabilities": ["providers"]
    }
  },
  "memoryAccess": {
    "archiveReadMode": "retrieval-with-citations",
    "archiveWriteMode": "intake-only",
    "citationRequired": true,
    "directKnowledgeWriteAllowed": false
  },
  "smokeTests": [
    {
      "id": "<addon>-direct-chat-smoke",
      "tool": "<addon>.chat",
      "input": {
        "prompt": "Say exactly: <ADDON>_SMOKE_OK"
      },
      "expectedOutputPattern": "^<ADDON>_SMOKE_OK$",
      "timeoutMs": 120000,
      "requiredCapabilities": ["shell", "providers"]
    }
  ]
}
```

## Required Implementation Notes

- Preserve existing local profiles by default. Installers must not overwrite identity, memory, skills, sessions, or provider config.
- Show missing install, missing credentials, stale version, incompatible runtime, and model mismatch as audit findings.
- Append the user's message immediately in chat before the agent finishes.
- Show a moving busy state while the agent is working.
- Prevent duplicate submit while a run is active unless the user explicitly creates another run.
- Filter terminal output before writing chat messages. Put raw logs in diagnostics, not the chat rail.
- Use the agent name as the chat author label.
- Read model metadata from the runtime and pass the selected model back to the invocation path.
- Treat Living Archive context as read-only evidence unless intake write has been granted.
- Ship deterministic smoke tests and run them before asking the human to validate manually.
