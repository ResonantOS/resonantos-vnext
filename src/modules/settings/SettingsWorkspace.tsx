// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import { useState } from "react";
import type {
  LivingArchiveMemoryServiceResult,
  LivingArchiveMemoryServiceStatus,
  ProviderDiagnosticReport,
  ProviderProfile,
  ProviderSmokeTestResult,
  ResonantShellState,
} from "../../core/contracts";
import {
  buildStrategyRouteOptions,
  costPostureLabel,
  formatStrategyRoute,
  routeOptionKey,
  type WorkloadStrategyPatch,
} from "../../core/model-strategy";
import { resolveAgentChatRoute, resolveWorkloadRoute } from "../../core/provider-service";
import { Panel } from "../../components/Panel";
import type { CreateProviderProfileInput } from "./controller";
import {
  providerTemplateCategoryLabels,
  providerTemplates,
  providerTemplatesByCategory,
  type ProviderTemplateCategory,
  type ProviderTemplateId,
} from "./provider-templates";

export type SettingsSection = "providers" | "strategy" | "memory" | "defaults" | "shell";

export const settingsItems: Array<{ id: SettingsSection; label: string; eyebrow: string }> = [
  { id: "providers", label: "Providers", eyebrow: "models + secrets" },
  { id: "strategy", label: "Strategy", eyebrow: "roles + fallbacks" },
  { id: "memory", label: "Memory Bridge", eyebrow: "MCP + local service" },
  { id: "defaults", label: "Defaults", eyebrow: "core behavior" },
  { id: "shell", label: "Shell", eyebrow: "layout + app" },
];

type SettingsWorkspaceProps = {
  state: ResonantShellState;
  settingsSection: SettingsSection;
  settingsNotice: string | null;
  providerDiagnostics: ProviderDiagnosticReport[];
  providerDiagnosticsBusy: boolean;
  activeProviderProbeId: string | null;
  providerSmokeResults: Record<string, ProviderSmokeTestResult>;
  providerSmokeBusyId: string | null;
  providerDrafts: Record<string, string>;
  memoryServiceStatus: LivingArchiveMemoryServiceStatus | null;
  memoryServiceBusy: boolean;
  memoryServiceLastResult: LivingArchiveMemoryServiceResult | null;
  onSettingsSectionChange: (section: SettingsSection) => void;
  onUpdateProvider: (profileId: string, field: "primaryModel" | "fallbackModel" | "status", value: string) => void;
  onCreateProvider: (input: CreateProviderProfileInput) => void;
  onUpdateWorkloadStrategy: (strategyId: string, patch: WorkloadStrategyPatch) => void;
  onUpdateWorkloadStrategyRoute: (strategyId: string, routeKey: string) => void;
  onProviderDraftChange: (profileId: string, value: string) => void;
  onSaveProviderSecret: (profileId: string) => void;
  onProbeProvider: (profileId: string) => void;
  onProbeAllProviders: () => void;
  onSetupProvider: (profileId: string) => void;
  onSmokeTestProvider: (profileId: string) => void;
  onRefreshMemoryServiceStatus: () => void;
  onStartMemoryService: () => void;
  onStopMemoryService: () => void;
};

const providerNeedsSecret = (profile: ProviderProfile): boolean =>
  profile.providerType === "openai" || profile.providerType === "openai-compatible" || profile.providerType === "minimax";

const providerSecretLabel = (profile: ProviderProfile): string =>
  profile.providerType === "minimax" ? "Token Plan / API key" : "API key";

const providerSecretPlaceholder = (profile: ProviderProfile): string => {
  if (profile.credentialStatus === "configured") {
    return "Saved on desktop side";
  }
  return profile.providerType === "minimax" ? "minimax-..." : "sk-...";
};

const providerTemplateCategoryOrder: ProviderTemplateCategory[] = [
  "direct-provider",
  "aggregator",
  "local-runtime",
  "runtime-node",
  "custom",
];

const providerTemplateExecutionLabel = (state: string): string => {
  if (state === "routable-now") {
    return "Routable now";
  }
  if (state === "adapter-pending") {
    return "Adapter pending";
  }
  return "Profile only";
};

export function SettingsWorkspace(props: SettingsWorkspaceProps) {
  const [expandedProviderIds, setExpandedProviderIds] = useState<Set<string>>(new Set());
  const [editingProviderId, setEditingProviderId] = useState<string | null>(null);
  const [addProviderOpen, setAddProviderOpen] = useState(false);
  const [addProviderTemplateId, setAddProviderTemplateId] = useState<ProviderTemplateId>("minimax");
  const [addProviderLabel, setAddProviderLabel] = useState(providerTemplates[0]?.label ?? "");
  const [addProviderSecret, setAddProviderSecret] = useState("");
  const [addProviderBaseUrl, setAddProviderBaseUrl] = useState(providerTemplates[0]?.defaultApiBaseUrl ?? "");
  const selectedProviderTemplate =
    providerTemplates.find((template) => template.id === addProviderTemplateId) ?? providerTemplates[0];
  const strategyRouteOptions = buildStrategyRouteOptions(props.state);

  const toggleProviderExpanded = (profileId: string) => {
    setExpandedProviderIds((current) => {
      const next = new Set(current);
      if (next.has(profileId)) {
        next.delete(profileId);
      } else {
        next.add(profileId);
      }
      return next;
    });
  };

  const handleProviderTemplateChange = (templateId: ProviderTemplateId) => {
    const template = providerTemplates.find((item) => item.id === templateId);
    setAddProviderTemplateId(templateId);
    setAddProviderLabel(template?.label ?? "");
    setAddProviderBaseUrl(template?.defaultApiBaseUrl ?? "");
    setAddProviderSecret("");
  };

  const handleCreateProvider = () => {
    if (!selectedProviderTemplate) {
      return;
    }
    props.onCreateProvider({
      templateId: selectedProviderTemplate.id,
      label: addProviderLabel,
      secret: addProviderSecret,
      apiBaseUrl: addProviderBaseUrl,
    });
    setAddProviderOpen(false);
    setAddProviderSecret("");
  };

  return (
    <div className="settings-shell">
      <aside className="settings-sidebar">
        <div className="settings-sidebar-head">
          <p className="eyebrow">Settings</p>
          <h2>System configuration</h2>
        </div>
        <nav className="settings-nav">
          {settingsItems.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`settings-nav-item ${props.settingsSection === item.id ? "active" : ""}`}
              onClick={() => props.onSettingsSectionChange(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.eyebrow}</small>
            </button>
          ))}
        </nav>
      </aside>

      <div className="settings-content">
        {props.settingsSection === "providers" && (
          <Panel title="AI Providers" subtitle="Configure the model routes ResonantOS can use for agents, archive work, and recovery.">
            {props.settingsNotice && <div className="inline-notice">{props.settingsNotice}</div>}
            <div className="provider-hero">
              <div className="provider-hero-copy">
                <p className="eyebrow">Provider fabric</p>
                <h3>Add one provider, then let ResonantOS route work through policy.</h3>
                <p>
                  Keep this page focused: add credentials at the top, scan health when needed, and expand a provider only when
                  you need technical details.
                </p>
              </div>
              <div className="provider-hero-actions">
                <button type="button" className="button-primary touch-action" onClick={() => setAddProviderOpen(true)}>
                  Add AI Provider
                </button>
                <button type="button" className="button-secondary touch-action" onClick={props.onProbeAllProviders} disabled={props.providerDiagnosticsBusy}>
                  {props.providerDiagnosticsBusy && !props.activeProviderProbeId ? "Checking..." : "Check Health"}
                </button>
              </div>
            </div>

            <div className="provider-list" aria-label="Configured AI providers">
              {props.state.providers.map((profile) => (
                <article key={profile.id} className={`provider-row ${expandedProviderIds.has(profile.id) ? "expanded" : ""}`}>
                  <div className="provider-row-main">
                    <button
                      type="button"
                      className="provider-row-title"
                      onClick={() => toggleProviderExpanded(profile.id)}
                      aria-expanded={expandedProviderIds.has(profile.id)}
                    >
                      <span className={`provider-dot provider-dot-${profile.status}`} aria-hidden="true" />
                      <span>
                        <strong>{profile.label}</strong>
                        <small>
                          {profile.providerType} · {profile.authTier}
                        </small>
                      </span>
                    </button>
                    <div className="provider-row-models">
                      <span>{profile.primaryModel}</span>
                      <small>{profile.fallbackModel ? `Fallback ${profile.fallbackModel}` : "No fallback"}</small>
                    </div>
                    <div className="provider-row-meta">
                      <span className={`tone tone-${profile.credentialStatus === "configured" ? "active" : "warning"}`}>
                        {profile.credentialStatus}
                      </span>
                      <span>{profile.allowedModels.length} models</span>
                    </div>
                    <div className="provider-row-actions">
                      <button type="button" className="button-quiet" onClick={() => setEditingProviderId(editingProviderId === profile.id ? null : profile.id)}>
                        {editingProviderId === profile.id ? "Close" : "Edit"}
                      </button>
                      <button type="button" className="button-quiet" onClick={() => props.onProbeProvider(profile.id)} disabled={props.providerDiagnosticsBusy}>
                        Probe
                      </button>
                      <button type="button" className="button-quiet" onClick={() => props.onSetupProvider(profile.id)}>
                        Setup
                      </button>
                      <button type="button" className="button-quiet" onClick={() => props.onSmokeTestProvider(profile.id)} disabled={props.providerSmokeBusyId === profile.id}>
                        Test
                      </button>
                    </div>
                  </div>

                  {(expandedProviderIds.has(profile.id) || editingProviderId === profile.id) && (
                    <div className="provider-row-detail">
                      {editingProviderId === profile.id && (
                        <div className="provider-edit-panel">
                          <label className="field">
                            <span>Status</span>
                            <select value={profile.status} onChange={(event) => props.onUpdateProvider(profile.id, "status", event.target.value)}>
                              <option value="ready">ready</option>
                              <option value="fallback">fallback</option>
                              <option value="missing">missing</option>
                            </select>
                          </label>
                          <label className="field">
                            <span>Primary model</span>
                            <select value={profile.primaryModel} onChange={(event) => props.onUpdateProvider(profile.id, "primaryModel", event.target.value)}>
                              {profile.allowedModels.map((model) => (
                                <option key={model} value={model}>
                                  {model}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="field">
                            <span>Fallback model</span>
                            <input
                              value={profile.fallbackModel ?? ""}
                              onChange={(event) => props.onUpdateProvider(profile.id, "fallbackModel", event.target.value)}
                              placeholder="optional"
                            />
                          </label>
                          {providerNeedsSecret(profile) && (
                            <div className="provider-secret-block">
                              <label className="field">
                                <span>{providerSecretLabel(profile)}</span>
                                <input
                                  type="password"
                                  value={props.providerDrafts[profile.id] ?? ""}
                                  onChange={(event) => props.onProviderDraftChange(profile.id, event.target.value)}
                                  placeholder={providerSecretPlaceholder(profile)}
                                />
                              </label>
                              <button type="button" className="button-secondary touch-action" onClick={() => props.onSaveProviderSecret(profile.id)}>
                                Save Key
                              </button>
                            </div>
                          )}
                        </div>
                      )}

                      <div className="provider-detail-grid">
                        <div>
                          <span className="eyebrow">Consumers</span>
                          <p>{profile.consumerScopes.join(", ")}</p>
                        </div>
                        <div>
                          <span className="eyebrow">Endpoint</span>
                          <p>{profile.apiBaseUrl ?? "Managed by runtime node"}</p>
                        </div>
                        <div>
                          <span className="eyebrow">Available models</span>
                          <p>{profile.allowedModels.join(", ")}</p>
                        </div>
                      </div>

                      {renderProviderDiagnostics(
                        props.providerDiagnostics.find((report) => report.providerId === profile.id),
                        props.providerDiagnosticsBusy && props.activeProviderProbeId === profile.id,
                        () => props.onProbeProvider(profile.id),
                        props.providerSmokeResults[profile.id],
                        props.providerSmokeBusyId === profile.id,
                        () => props.onSmokeTestProvider(profile.id),
                      )}

                      <div className="provider-runtime-list">
                        <span className="eyebrow">Runtime nodes</span>
                        <ul>
                          {props.state.runtimeNodes
                            .filter((node) => node.providerProfileId === profile.id)
                            .map((node) => (
                              <li key={node.id}>
                                <strong>{node.label}</strong>
                                <span>
                                  {node.kind} · {node.locality} · {node.healthState}
                                </span>
                              </li>
                            ))}
                        </ul>
                      </div>
                    </div>
                  )}
                </article>
              ))}
            </div>

            {addProviderOpen && selectedProviderTemplate && (
              <div className="provider-dialog-backdrop" role="presentation" onClick={() => setAddProviderOpen(false)}>
                <form
                  className="provider-dialog-card"
                  onClick={(event) => event.stopPropagation()}
                  onSubmit={(event) => {
                    event.preventDefault();
                    handleCreateProvider();
                  }}
                >
                  <div className="provider-dialog-head">
                    <div>
                      <p className="eyebrow">Add provider</p>
                      <h3>Connect an AI provider</h3>
                    </div>
                    <button type="button" className="button-quiet" onClick={() => setAddProviderOpen(false)}>
                      Close
                    </button>
                  </div>
                  <label className="field">
                    <span>Provider</span>
                    <select value={addProviderTemplateId} onChange={(event) => handleProviderTemplateChange(event.target.value as ProviderTemplateId)}>
                      {providerTemplateCategoryOrder.map((category) => (
                        <optgroup key={category} label={providerTemplateCategoryLabels[category]}>
                          {providerTemplatesByCategory(category).map((template) => (
                            <option key={template.id} value={template.id}>
                              {template.label}
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Name in ResonantOS</span>
                    <input value={addProviderLabel} onChange={(event) => setAddProviderLabel(event.target.value)} placeholder={selectedProviderTemplate.label} />
                  </label>
                  {selectedProviderTemplate.requiresBaseUrl && (
                    <label className="field">
                      <span>API base URL</span>
                      <input value={addProviderBaseUrl} onChange={(event) => setAddProviderBaseUrl(event.target.value)} placeholder="https://api.provider.com/v1" />
                    </label>
                  )}
                  {selectedProviderTemplate.requiresSecret && (
                    <label className="field">
                      <span>{selectedProviderTemplate.id === "minimax" ? "Token Plan / API key" : "API key"}</span>
                      <input
                        type="password"
                        value={addProviderSecret}
                        onChange={(event) => setAddProviderSecret(event.target.value)}
                        placeholder={selectedProviderTemplate.id === "minimax" ? "minimax-..." : "sk-..."}
                      />
                    </label>
                  )}
                  <div className="provider-template-note">
                    <strong>
                      {selectedProviderTemplate.shortLabel} · {providerTemplateExecutionLabel(selectedProviderTemplate.executionState)}
                    </strong>
                    <p>{selectedProviderTemplate.note}</p>
                  </div>
                  <div className="provider-dialog-actions">
                    <button type="button" className="button-secondary touch-action" onClick={() => setAddProviderOpen(false)}>
                      Cancel
                    </button>
                    <button type="submit" className="button-primary touch-action">
                      Add Provider
                    </button>
                  </div>
                </form>
              </div>
            )}
          </Panel>
        )}

        {props.settingsSection === "defaults" && (
          <Panel title="Core Defaults" subtitle="Default system behavior for the shell, archive, and Strategist.">
            <div className="settings-grid">
              <SettingNote label="Distribution model" value={props.state.distributionModel} />
              <SettingNote label="Default Strategist name" value={props.state.strategistIdentity.defaultName} />
              <SettingNote label="Archive write authority" value={props.state.archivePolicy.ingestServiceId} />
              <SettingNote label="Telegram mode" value="Strategist channel add-on" />
            </div>
          </Panel>
        )}

        {props.settingsSection === "memory" && (
          <Panel
            title="Living Archive Memory Bridge"
            subtitle="Expose scoped memory to external MCP clients without giving them direct trusted wiki write authority."
          >
            {props.settingsNotice && <div className="inline-notice">{props.settingsNotice}</div>}
            <div className="memory-service-hero">
              <div>
                <p className="eyebrow">Local endpoint</p>
                <h3>{props.memoryServiceStatus?.running ? "Bridge running" : "Bridge stopped"}</h3>
                <p>
                  Start this service when Codex, Claude Desktop, OpenCode, or another MCP-capable client needs scoped access to
                  the Living Archive.
                </p>
              </div>
              <span className={`tone tone-${props.memoryServiceStatus?.running ? "active" : "neutral"}`}>
                {props.memoryServiceStatus?.running ? "online" : "offline"}
              </span>
            </div>

            <div className="provider-toolbar">
              <div className="provider-toolbar-copy">
                <strong>{props.memoryServiceStatus?.endpoint ?? "http://127.0.0.1:4888"}</strong>
                <p>
                  MCP clients should set{" "}
                  <code>RESONANTOS_MEMORY_SERVICE_URL={props.memoryServiceStatus?.endpoint ?? "http://127.0.0.1:4888"}</code>.
                </p>
              </div>
              <button
                type="button"
                className="button-secondary touch-action"
                onClick={props.onRefreshMemoryServiceStatus}
                disabled={props.memoryServiceBusy}
              >
                {props.memoryServiceBusy ? "Checking..." : "Refresh"}
              </button>
              {props.memoryServiceStatus?.running ? (
                <button
                  type="button"
                  className="button-secondary touch-action"
                  onClick={props.onStopMemoryService}
                  disabled={props.memoryServiceBusy}
                >
                  Stop
                </button>
              ) : (
                <button
                  type="button"
                  className="button-primary touch-action"
                  onClick={props.onStartMemoryService}
                  disabled={props.memoryServiceBusy || props.memoryServiceStatus?.available === false}
                >
                  Start Bridge
                </button>
              )}
            </div>

            <div className="settings-grid">
              <SettingNote label="Memory root" value={props.memoryServiceStatus?.memoryRoot || "Not resolved yet"} />
              <SettingNote label="Session" value={props.memoryServiceStatus?.sessionId || "living-archive-memory-service"} />
              <SettingNote label="Readonly" value={props.memoryServiceStatus?.readonly ? "enabled" : "disabled"} />
              <SettingNote label="Process" value={props.memoryServiceStatus?.pid ? `pid ${props.memoryServiceStatus.pid}` : "not running"} />
            </div>

            <div className="provider-card">
              <div className="provider-head">
                <div>
                  <strong>Boundary</strong>
                  <p>{props.memoryServiceStatus?.statusDetail ?? "Run status to inspect the host-owned bridge state."}</p>
                </div>
                <span className="tone tone-warning">intake-only writes</span>
              </div>
              <ul>
                <li>External clients can search/read scoped memory and write raw artifacts to intake.</li>
                <li>Trusted AI Memory wiki pages are still written only by the Strategist-owned ingest/review flow.</li>
                <li>Provider-backed promotion and semantic repair stay inside the desktop host boundary.</li>
              </ul>
              {props.memoryServiceLastResult ? (
                <p className="mono-inline">
                  Last action: {props.memoryServiceLastResult.endpoint} · {props.memoryServiceLastResult.command}
                </p>
              ) : null}
            </div>
          </Panel>
        )}

        {props.settingsSection === "strategy" && (
          <Panel title="Model Strategy Profile" subtitle="User-agreed routing strategy for roles, workloads, and fallback behavior.">
            <div className="strategy-header">
              <div>
                <p className="eyebrow">Active profile</p>
                <h3>{props.state.modelStrategy.label}</h3>
                <p>{props.state.modelStrategy.summary}</p>
              </div>
            </div>

            <div className="strategy-grid">
              {props.state.modelStrategy.workloadStrategies.map((strategy) => {
                const routeDecision =
                  strategy.ownerType === "agent"
                    ? resolveAgentChatRoute(props.state, strategy.ownerId)
                    : resolveWorkloadRoute(props.state, strategy.workloadClass);
                return (
                  <article key={strategy.id} className="provider-card strategy-editor-card">
                    <div className="provider-head">
                      <div>
                        <strong>{strategy.label}</strong>
                        <p>
                          {strategy.workloadClass} · {strategy.ownerType} · {strategy.ownerId}
                        </p>
                      </div>
                      <span className={`tone tone-${strategy.hardStopWhenNoFallback ? "warning" : "active"}`}>
                        {strategy.hardStopWhenNoFallback ? "hard-stop" : "fallback-ok"}
                      </span>
                    </div>
                    <div className="strategy-route-block">
                      <span className="eyebrow">Current decision</span>
                      <strong>{routeDecision.model ?? "No viable route"}</strong>
                      <p>
                        {routeDecision.provider?.label ?? "Missing provider"}
                        {routeDecision.runtimeNode ? ` via ${routeDecision.runtimeNode.label}` : ""} ·{" "}
                        {routeDecision.decision.resolutionReason}
                      </p>
                    </div>
                    <label className="field">
                      <span>Primary route</span>
                      <select
                        value={routeOptionKey(strategy.primaryRoute)}
                        onChange={(event) => props.onUpdateWorkloadStrategyRoute(strategy.id, event.target.value)}
                      >
                        {strategyRouteOptions.map((option) => (
                          <option key={option.key} value={option.key}>
                            {option.label} · {option.detail}
                          </option>
                        ))}
                      </select>
                    </label>
                    <div className="strategy-route-block">
                      <span className="eyebrow">Agreed primary</span>
                      <strong>{formatStrategyRoute(props.state, strategy.primaryRoute)}</strong>
                      <p>{costPostureLabel(strategy.primaryRoute.costPosture)}</p>
                    </div>
                    <label className="field">
                      <span>Fallback chain</span>
                      <select
                        value={strategy.fallbackChainId}
                        onChange={(event) =>
                          props.onUpdateWorkloadStrategy(strategy.id, { fallbackChainId: event.target.value })
                        }
                      >
                        {props.state.modelStrategy.fallbackChains.map((chain) => (
                          <option key={chain.id} value={chain.id}>
                            {chain.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Failure behavior</span>
                      <select
                        value={strategy.hardStopWhenNoFallback ? "hard-stop" : "fallback"}
                        onChange={(event) =>
                          props.onUpdateWorkloadStrategy(strategy.id, {
                            hardStopWhenNoFallback: event.target.value === "hard-stop",
                          })
                        }
                      >
                        <option value="fallback">Use agreed fallbacks</option>
                        <option value="hard-stop">Hard-stop if chain fails</option>
                      </select>
                    </label>
                    <div className="strategy-chain-block">
                      <span className="eyebrow">Fallback order</span>
                      <strong>{resolveFallbackLabel(props.state, strategy.fallbackChainId)}</strong>
                      <ul>
                        {resolveFallbackSteps(props.state, strategy.fallbackChainId).map((route) => (
                          <li key={`${strategy.id}:${route.providerProfileId}:${route.model}`}>
                            {formatStrategyRoute(props.state, route)} · {costPostureLabel(route.costPosture)}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <ul>
                      {strategy.notes.map((note) => (
                        <li key={note}>{note}</li>
                      ))}
                    </ul>
                  </article>
                );
              })}
            </div>

            <div className="strategy-emergency-block">
              <div className="provider-head">
                <div>
                  <strong>Emergency policy</strong>
                  <p>{props.state.modelStrategy.emergencyPolicy.note}</p>
                </div>
                <span className="tone tone-warning">recovery</span>
              </div>
              <div className="strategy-chain-block">
                <span className="eyebrow">Promotion order</span>
                <ul>
                  {props.state.modelStrategy.emergencyPolicy.orderedPromotionTargets.map((route) => (
                    <li key={`emergency:${route.providerProfileId}:${route.model}`}>
                      {formatStrategyRoute(props.state, route)} · {costPostureLabel(route.costPosture)}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="strategy-route-block">
                <span className="eyebrow">Hard floor</span>
                <strong>{formatStrategyRoute(props.state, props.state.modelStrategy.emergencyPolicy.hardFloorRoute)}</strong>
                <p>{costPostureLabel(props.state.modelStrategy.emergencyPolicy.hardFloorRoute.costPosture)}</p>
              </div>
            </div>
          </Panel>
        )}

        {props.settingsSection === "shell" && (
          <Panel title="Shell Preferences" subtitle="Current layout and operating posture for ResonantOS vNext.">
            <div className="settings-grid">
              <SettingNote label="Theme" value={props.state.uiPreferences.theme} />
              <SettingNote label="Chat rail" value={props.state.uiPreferences.chatSidebarOpen ? "visible" : "collapsed"} />
              <SettingNote label="Primary section" value={props.state.uiPreferences.activeSection} />
              <SettingNote label="Desktop mode" value="workspace-first shell" />
            </div>
          </Panel>
        )}
      </div>
    </div>
  );
}

function resolveFallbackLabel(state: ResonantShellState, fallbackChainId: string): string {
  return state.modelStrategy.fallbackChains.find((chain) => chain.id === fallbackChainId)?.label ?? fallbackChainId;
}

function resolveFallbackSteps(state: ResonantShellState, fallbackChainId: string) {
  const chain = state.modelStrategy.fallbackChains.find((item) => item.id === fallbackChainId);
  if (!chain) {
    return [];
  }
  return chain.lastResortRoute ? [...chain.orderedRoutes, chain.lastResortRoute] : chain.orderedRoutes;
}

function renderProviderDiagnostics(
  report: ProviderDiagnosticReport | undefined,
  busy: boolean,
  onProbe: () => void,
  smokeResult: ProviderSmokeTestResult | undefined,
  smokeBusy: boolean,
  onSmokeTest: () => void,
) {
  return (
    <div className="provider-diagnostics-block">
      <div className="provider-diagnostics-head">
        <div>
          <span className="eyebrow">Diagnostics</span>
          <p>{report?.summary ?? "No diagnostics have been run for this provider yet."}</p>
        </div>
        <div className="provider-diagnostics-actions">
          {report && <span className={`tone tone-${toneFromDiagnosticStatus(report.status)}`}>{report.status}</span>}
          <button type="button" className="button-secondary" onClick={onProbe} disabled={busy}>
            {busy ? "Probing..." : "Probe"}
          </button>
          <button type="button" className="button-secondary" onClick={onSmokeTest} disabled={smokeBusy}>
            {smokeBusy ? "Testing..." : "Smoke Test"}
          </button>
        </div>
      </div>
      {smokeResult && (
        <div className="provider-smoke-result">
          <strong>{smokeResult.summary}</strong>
          <span>
            {smokeResult.model} · {smokeResult.usage?.totalTokens ? `${smokeResult.usage.totalTokens} tokens` : "usage unavailable"}
          </span>
          <p>{smokeResult.replyPreview}</p>
        </div>
      )}
      {report && (
        <>
          <p className="provider-diagnostics-meta">
            Checked {report.checkedAt} · adapter {report.executionAdapter} · {report.credentialConfigured ? "credentials configured" : "credentials missing"}
          </p>
          <ul className="provider-diagnostics-list">
            {report.runtimeDiagnostics.map((runtime) => (
              <li key={runtime.runtimeNodeId}>
                <strong>{runtime.runtimeNodeLabel}</strong>
                <span>
                  {runtime.runtimeKind} · {runtime.locality} · {runtime.probeState}
                </span>
                <p>{runtime.detail}</p>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function toneFromDiagnosticStatus(status: ProviderDiagnosticReport["status"]): "active" | "warning" | "neutral" {
  if (status === "healthy") {
    return "active";
  }
  if (status === "attention") {
    return "warning";
  }
  return "neutral";
}

function SettingNote(props: { label: string; value: string }) {
  return (
    <div className="setting-note">
      <span>{props.label}</span>
      <strong>{props.value}</strong>
    </div>
  );
}
