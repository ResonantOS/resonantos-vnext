// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md
// Intent citation: docs/architecture/ADR-006-addon-runtime-sdk.md

export type Capability =
  | "filesystem"
  | "archive-read"
  | "archive-intake-write"
  | "providers"
  | "shell"
  | "network"
  | "ui-embedding"
  | "agent-delegation"
  | "notifications"
  | "device-integration";

export type CapabilityScope = "none" | "self" | "workspace" | "shared" | "system" | "intake-only";
export type RevocationBehavior = "hard-stop" | "degrade" | "hide-surface";
export type AddOnRuntimeType = "ui-module" | "embedded-module" | "local-service" | "agent-addon" | "channel-addon";
export type AddOnSurfaceType =
  | "page"
  | "panel"
  | "embedded-pane"
  | "modal"
  | "tool-action"
  | "background-task-monitor"
  | "channel";
export type AddOnCategory = "agent" | "channel" | "memory" | "security" | "knowledge" | "tool" | "integration";
export type TrustTier = "core" | "addon" | "external";
export type WorkspaceBehavior = "primary" | "delegated" | "background";
export type ChannelType = "desktop" | "telegram" | "voice" | "mobile";
export type WorkspaceKind = "main" | "delegated" | "embedded-tool";
export type WorkspaceVisibility = "user-facing" | "background";
export type ProviderType = "openai" | "anthropic" | "google" | "minimax" | "openai-compatible" | "local" | "custom";
export type AuthSource = "shared-vault" | "addon-private" | "manual";
export type AuthTier = "supported" | "experimental" | "unavailable";
export type ProviderAuthMethod = "api-key" | "subscription" | "oauth" | "local-runtime" | "custom";
export type ProviderStatus = "ready" | "fallback" | "missing";
export type RuntimeNodeKind = "cloud" | "local" | "remote-user-owned";
export type RuntimeNodeLocality = "cloud" | "desktop-local" | "lan-remote" | "wan-remote";
export type RuntimeNodeHealthState = "ready" | "degraded" | "deployable" | "unavailable";
export type ProviderExecutionAdapterId = "cloud-openai-compatible" | "cloud-minimax-compatible" | "local-ollama";
export type RoutingResolutionReason =
  | "primary-healthy"
  | "primary-unavailable"
  | "fallback-in-policy"
  | "resurrection-available"
  | "no-viable-route";
export type WorkloadClass =
  | "primary-chat"
  | "coding"
  | "agentic-coding"
  | "routine"
  | "archive-ingest"
  | "recovery"
  | "background";
export type InstallationStatus = "available" | "installed" | "enabled" | "disabled" | "degraded" | "update-available" | "incompatible";
export type CoreServiceStatus = "ready" | "attention" | "planned";
export type ArchiveActorType = "core-agent" | "addon" | "service";
export type ArchiveAction = "archive-read" | "archive-intake-write" | "archive-knowledge-write" | "archive-ingest-request";
export type ConversationRole = "user" | "assistant";
export type AddOnProvenanceTier = "bundled-core" | "curated-signed" | "enterprise-signed" | "sideloaded-unverified";
export type ManifestVerificationState = "verified" | "unverified" | "not-applicable" | "failed";
export type GrantRecommendationSource = "manifest-request" | "preset-bundle" | "manual";
export type RuntimeIsolationBoundary =
  | "shell-ui"
  | "embedded-surface"
  | "host-mediated-service"
  | "host-mediated-agent"
  | "host-mediated-channel";

export interface CapabilityGrant {
  capability: Capability;
  granted: boolean;
  scope: CapabilityScope;
  revocationBehavior: RevocationBehavior;
}

export interface AddOnSurface {
  id: string;
  type: AddOnSurfaceType;
  label: string;
  description: string;
}

export interface AddOnGrantPreset {
  id: string;
  label: string;
  description: string;
  grants: CapabilityGrant[];
}

export interface AddOnProvenance {
  tier: AddOnProvenanceTier;
  verificationState: ManifestVerificationState;
  signed: boolean;
  signer?: string;
  signatureRef?: string;
}

export interface AddOnRuntimeIsolation {
  boundary: RuntimeIsolationBoundary;
  supportsDegradedMode: boolean;
  requiresReviewedGrant: boolean;
}

export interface AddOnManifest {
  id: string;
  name: string;
  version: string;
  author: string;
  category: AddOnCategory;
  description: string;
  runtimeType: AddOnRuntimeType;
  surfaces: AddOnSurface[];
  requestedCapabilities: CapabilityGrant[];
  provenance?: AddOnProvenance;
  grantPresets?: AddOnGrantPreset[];
  runtimeIsolation?: AddOnRuntimeIsolation;
  providerRequirements: {
    sharedProfiles: string[];
    supportsPrivateCredentials: boolean;
    recommendedPrimaryModel?: string;
    recommendedFallbackModel?: string;
    preferredRuntimeKinds?: RuntimeNodeKind[];
    allowExperimentalAuth?: boolean;
    fallbackPolicyId?: string;
  };
  archiveIntegration: {
    readScopes: string[];
    intakeWriteScopes: string[];
    canRequestIngest: boolean;
    canWriteKnowledgePages: boolean;
  };
  health: {
    strategy: string;
    endpoint?: string;
  };
  installHooks: {
    onInstall?: string;
    onEnable?: string;
    onUpgrade?: string;
  };
  compatibility: {
    shellVersion: string;
    platforms: string[];
  };
  agents?: Array<{
    id: string;
    displayName: string;
    trustTier: Exclude<TrustTier, "core">;
    workspaceBehavior: WorkspaceBehavior;
  }>;
}

export interface ProviderProfile {
  id: string;
  label: string;
  providerType: ProviderType;
  authSource: AuthSource;
  authMethod: ProviderAuthMethod;
  authTier: AuthTier;
  apiBaseUrl?: string;
  allowedModels: string[];
  primaryModel: string;
  fallbackModel?: string;
  consumerScopes: string[];
  shared: boolean;
  status: ProviderStatus;
  credentialStatus: "configured" | "missing";
}

export interface ProviderRuntimeDiagnostic {
  runtimeNodeId: string;
  runtimeNodeLabel: string;
  runtimeKind: RuntimeNodeKind;
  locality: RuntimeNodeLocality;
  probeState: "healthy" | "attention" | "unavailable" | "unprobeable";
  detail: string;
}

export interface ProviderDiagnosticReport {
  providerId: string;
  providerLabel: string;
  providerType: ProviderType;
  authMethod: ProviderAuthMethod;
  authTier: AuthTier;
  executionAdapter: ProviderExecutionAdapterId | "unsupported";
  credentialConfigured: boolean;
  status: "healthy" | "attention" | "offline";
  summary: string;
  checkedAt: string;
  primaryModel: string;
  fallbackModel?: string;
  runtimeDiagnostics: ProviderRuntimeDiagnostic[];
}

export interface ProviderRuntimeNode {
  id: string;
  label: string;
  providerProfileId: string;
  kind: RuntimeNodeKind;
  locality: RuntimeNodeLocality;
  endpoint?: string;
  supportedModels: string[];
  authTier: AuthTier;
  healthState: RuntimeNodeHealthState;
  deployableOnDemand: boolean;
  notes?: string[];
}

export interface ProviderRoutingPolicyInput {
  consumerId: string;
  allowedProviderProfileIds?: string[];
  preferredProviderProfileIds?: string[];
  preferredRuntimeNodeIds?: string[];
  preferredModels?: string[];
  allowedRuntimeKinds?: RuntimeNodeKind[];
  allowedAdapterIds?: ProviderExecutionAdapterId[];
  preferredLocalities?: RuntimeNodeLocality[];
  allowedAuthTiers?: AuthTier[];
  requiredCapabilities?: string[];
  allowExperimentalAuth?: boolean;
  allowResurrection?: boolean;
  fallbackPolicyId?: string;
}

export interface ProviderFallbackPolicy {
  id: string;
  label: string;
  orderedProviderProfileIds: string[];
  orderedRuntimeNodeIds?: string[];
  allowExperimentalAuth: boolean;
  allowResurrection: boolean;
  onFailure: "hard-stop" | "degrade";
}

export interface ProviderRecoveryAction {
  id: string;
  label: string;
  trigger: "panic-button" | "automatic";
  targetAgentIds: string[];
  runtimeNodeId: string;
  prepared: boolean;
  note: string;
}

export interface ProviderExecutionAdapterPolicy {
  id: ProviderExecutionAdapterId;
  label: string;
  supportedProviderTypes: ProviderType[];
  supportedRuntimeKinds: RuntimeNodeKind[];
  supportedAuthMethods: ProviderAuthMethod[];
  supportsReasoningEffort: boolean;
  requiresCredential: boolean;
  experimental: boolean;
  notes: string[];
}

export interface ProviderRoutingDecision {
  providerProfileId?: string;
  runtimeNodeId?: string;
  executionAdapterId?: ProviderExecutionAdapterId;
  model?: string;
  authTier: AuthTier;
  usingFallback: boolean;
  resolutionReason: RoutingResolutionReason;
  fallbackPolicyId?: string;
  recoveryActionId?: string;
}

export interface ProviderRoutingState {
  policyEngineId: string;
  executionAdapters: ProviderExecutionAdapterPolicy[];
  fallbackPolicies: ProviderFallbackPolicy[];
  recoveryActions: ProviderRecoveryAction[];
  experimentalPolicy: {
    allowOptIn: boolean;
    note: string;
  };
}

export interface StrategyRouteReference {
  providerProfileId: string;
  runtimeNodeId?: string;
  model: string;
  note?: string;
}

export interface StrategyFallbackChain {
  id: string;
  label: string;
  rule: string;
  orderedRoutes: StrategyRouteReference[];
  lastResortRoute?: StrategyRouteReference;
}

export interface WorkloadStrategy {
  id: string;
  label: string;
  workloadClass: WorkloadClass;
  ownerType: "agent" | "workload";
  ownerId: string;
  primaryRoute: StrategyRouteReference;
  fallbackChainId: string;
  hardStopWhenNoFallback: boolean;
  notes: string[];
}

export interface ModelStrategyState {
  profileId: string;
  label: string;
  summary: string;
  workloadStrategies: WorkloadStrategy[];
  fallbackChains: StrategyFallbackChain[];
  emergencyPolicy: {
    preferBestAvailable: boolean;
    orderedPromotionTargets: StrategyRouteReference[];
    hardFloorRoute: StrategyRouteReference;
    note: string;
  };
}

export interface LocalRuntimeStatus {
  available: boolean;
  targetModel: string;
  recoveryModelInstalled: boolean;
  recoveryModelRunning: boolean;
  installedModels: string[];
  runningModels: string[];
  ollamaListRaw: string;
  ollamaPsRaw: string;
}

export interface ArchiveIngestProbeResult {
  sourceLabel: string;
  summary: string;
  checkedAt: string;
}

export interface ArchivePathMapping {
  path: string;
  role: string;
  subtype?: string;
  absolutePath: string;
  exists: boolean;
  managedByAi: boolean;
  immutable: boolean;
  renameAllowed: boolean;
  moveAllowed: boolean;
}

export interface ArchiveSourceRoot {
  role: string;
  subtype?: string;
  path: string;
  exists: boolean;
}

export interface ArchiveIngestAgentStatus {
  enabled: boolean;
  provider?: string;
  model?: string;
  reasoningEffort?: string;
  configFile: string;
  promptFile: string;
  configExists: boolean;
  promptExists: boolean;
}

export interface ArchiveStats {
  pagesTotal: number;
  pagesByType: Record<string, number>;
  linksTotal: number;
  sourcesTotal: number;
  sourcesUnprocessed: number;
  activity7d: number;
}

export interface ArchiveActivityEntry {
  ts: string;
  action: string;
  pageId?: string;
  sourceId?: string;
  agentId?: string;
  details?: Record<string, unknown>;
  errors?: string;
}

export interface ArchiveRuntimeStatus {
  status: "ready" | "attention" | "missing";
  mode: string;
  configPath: string;
  vaultRoot: string;
  managedRoot: string;
  wikiRoot: string;
  dataRoot: string;
  logsRoot: string;
  configRoot: string;
  mappingFile: string;
  intakeRoot: string;
  reviewQueueRoot: string;
  mappings: ArchivePathMapping[];
  sourceRoots: ArchiveSourceRoot[];
  ingestAgent: ArchiveIngestAgentStatus;
  stats?: ArchiveStats;
  recentActivity: ArchiveActivityEntry[];
}

export interface ArchiveSearchPageHit {
  pageId: string;
  title: string;
  pageType: string;
  filePath: string;
  stage?: string;
  updated?: string;
  score: number;
  snippet: string;
}

export interface ArchiveSearchSourceHit {
  sourceId: string;
  title: string;
  sourceType: string;
  rawPath: string;
  processed: boolean;
}

export interface ArchiveSearchResult {
  query: string;
  pages: ArchiveSearchPageHit[];
  sources: ArchiveSearchSourceHit[];
}

export type ArchiveSourceWatchStatus = "new" | "changed" | "unchanged";

export interface ArchiveSourceWatchRecord {
  path: string;
  absolutePath: string;
  rootRole: string;
  rootSubtype?: string;
  sourceType: string;
  title: string;
  hash: string;
  previousHash?: string;
  sizeBytes: number;
  modifiedAt: string;
  status: ArchiveSourceWatchStatus;
  indexedInDb: boolean;
}

export interface ArchiveSourceFolderScanResult {
  scannedAt: string;
  rootsScanned: number;
  filesSeen: number;
  newFiles: number;
  changedFiles: number;
  unchangedFiles: number;
  skippedFiles: number;
  records: ArchiveSourceWatchRecord[];
  indexPath: string;
}

export type ArchiveMemoryDomain = "mixed-library" | "human-knowledge" | "external-knowledge" | "ai-memory";
export type ArchiveLibraryImportMode = "copy" | "move" | "reference";

export interface ArchiveLibraryImportSourceRecord {
  sourceId: string;
  versionId: string;
  originalPath: string;
  canonicalPath: string;
  sourceType: string;
  title: string;
  hash: string;
  sizeBytes: number;
}

export type ArchiveClassificationTarget = "human-knowledge" | "external-knowledge" | "unclear";

export interface ArchiveClassificationProposal {
  sourceId: string;
  title: string;
  canonicalPath: string;
  proposedTarget: ArchiveClassificationTarget;
  confidence: "low" | "medium" | "high";
  reason: string;
  tags: string[];
  wikilinks: string[];
}

export interface ArchiveLibraryImportResult {
  importedAt: string;
  domain: ArchiveMemoryDomain;
  importMode: ArchiveLibraryImportMode;
  libraryId: string;
  libraryName: string;
  originalPath: string;
  canonicalRoot: string;
  filesSeen: number;
  filesImported: number;
  skippedFiles: number;
  manifestPath: string;
  versionLedgerPath: string;
  classificationManifestPath?: string;
  classificationStatus: string;
  metadataStandard: string;
  obsidianVaultDetected: boolean;
  recommendedAddon?: string;
  records: ArchiveLibraryImportSourceRecord[];
  classificationProposals: ArchiveClassificationProposal[];
}

export interface ArchiveImportedLibrarySummary {
  importedAt: string;
  domain: ArchiveMemoryDomain | string;
  importMode: ArchiveLibraryImportMode | string;
  libraryId: string;
  libraryName: string;
  originalPath: string;
  canonicalRoot: string;
  filesSeen: number;
  filesImported: number;
  skippedFiles: number;
  manifestPath: string;
  versionLedgerPath?: string;
  classificationManifestPath?: string;
  classificationStatus: string;
  metadataStandard: string;
  obsidianVaultDetected: boolean;
  recommendedAddon?: string;
  recordsCount: number;
}

export interface ArchiveSystemMemorySource {
  relativePath: string;
  absolutePath: string;
  exists: boolean;
  required: boolean;
  hash?: string;
  sizeBytes?: number;
  modifiedAt?: string;
}

export interface ArchiveSystemMemoryPage {
  pageId: string;
  title: string;
  filePath: string;
  sourceCount: number;
  hash: string;
}

export interface ArchiveSystemMemoryStatus {
  status: "missing" | "blocked" | "stale" | "ready" | string;
  generatedAt?: string;
  manifestPath: string;
  pagesRoot: string;
  sources: ArchiveSystemMemorySource[];
  pages: ArchiveSystemMemoryPage[];
  staleSources: string[];
  missingSources: string[];
}

export interface ArchiveSystemMemoryRefreshResult {
  refreshedAt: string;
  manifestPath: string;
  pagesRoot: string;
  pagesWritten: ArchiveSystemMemoryPage[];
  sourcesIndexed: number;
  missingSources: string[];
}

export interface ArchiveDocumentPayload {
  path: string;
  title?: string;
  docType?: string;
  frontmatter: Record<string, unknown>;
  content: string;
}

export interface ArchiveIntakeWriteResult {
  actorId: string;
  bucket: string;
  artifactPath: string;
  metadataPath?: string;
}

export interface ArchiveIngestRequestResult {
  requestFile: string;
  queuedAt: string;
}

export interface ArchiveQueuedIngestRequest {
  requestFile: string;
  queuedAt: string;
  actorId: string;
  sourcePath: string;
  sourceType: string;
  sourceRole?: string;
  intent: string;
  sourceExists: boolean;
}

export type ArchiveApprovalTier = "auto-approve" | "strategist-review" | "human-review";
export type ArchiveReviewDecisionStatus = "pending" | "approved" | "rejected" | "escalated";
export type ArchiveReviewDecisionAction = "approve" | "reject" | "escalate";
export type ArchiveReviewConfidence = "low" | "medium" | "high";
export type ArchiveDoctrineSensitivity = "low" | "medium" | "high";

export interface ArchiveReviewDecision {
  status: ArchiveReviewDecisionStatus;
  action?: ArchiveReviewDecisionAction;
  actorId?: string;
  decidedAt?: string;
  tierApplied?: ArchiveApprovalTier;
  notes?: string;
}

export interface ArchiveReviewArtifact {
  artifactFile: string;
  checkedAt: string;
  requestFile: string;
  sourcePath: string;
  sourceType: string;
  sourceRole?: string;
  intent: string;
  providerId: string;
  model: string;
  summary: string;
  confidence: ArchiveReviewConfidence;
  doctrineSensitivity: ArchiveDoctrineSensitivity;
  recommendedTier: ArchiveApprovalTier;
  recommendationReason: string;
  proposedPages: Array<Record<string, unknown>>;
  decision: ArchiveReviewDecision;
}

export interface ArchiveProcessIngestResult {
  requestFile: string;
  archivedRequestFile: string;
  reviewArtifactFile: string;
  summary: string;
  checkedAt: string;
  reviewArtifact: ArchiveReviewArtifact;
}

export interface ArchiveReviewDecisionResult {
  artifactFile: string;
  status: ArchiveReviewDecisionStatus;
  action: ArchiveReviewDecisionAction;
  actorId: string;
  decidedAt: string;
  tierApplied: ArchiveApprovalTier;
  summary: string;
}

export interface ArchivePromotedPage {
  pageType: "summary" | "entity" | "concept" | "synthesis";
  pageId: string;
  title: string;
  filePath: string;
  action: "created" | "updated";
  backupPath?: string;
  sourceId: string;
  indexed: boolean;
  mergeMode: "create-page" | "append-provenance-section";
}

export interface ArchiveSkippedPage {
  title: string;
  reason: string;
}

export interface ArchivePromoteReviewArtifactResult {
  artifactFile: string;
  promotedAt: string;
  actorId: string;
  pagesWritten: ArchivePromotedPage[];
  skippedPages: ArchiveSkippedPage[];
}

export interface ArchiveTolBundleCandidate {
  sessionId: string;
  rawAudioPath?: string;
  transcriptPath?: string;
  analysisPath?: string;
  date?: string;
  time?: string;
  summary?: string;
  status: string;
  strategicActionsCount: number;
  explicitDirectivesCount: number;
}

export interface ArchiveTolBundleBuildResult {
  sessionId: string;
  intakeArtifactPath: string;
  requestFile: string;
  queuedAt: string;
  rawAudioPath?: string;
  transcriptPath: string;
  analysisPath: string;
}

export type EngineerToolEventStatus = "completed" | "failed";

export interface EngineerToolEvent {
  tool: string;
  summary: string;
  status: EngineerToolEventStatus;
}

export interface EngineerRecoveryTurnResult {
  reply: string;
  toolEvents: EngineerToolEvent[];
}

export interface RecoveryRouteCandidate {
  id: string;
  providerId: string;
  providerLabel: string;
  runtimeNodeId: string;
  runtimeNodeLabel: string;
  runtimeKind: RuntimeNodeKind;
  model: string;
  credentialConfigured: boolean;
  reachable: boolean;
  promotable: boolean;
  recommended: boolean;
  reason: string;
}

export interface AgentDefinition {
  id: string;
  displayName: string;
  trustTier: TrustTier;
  workspaceBehavior: WorkspaceBehavior;
  providerProfileId: string;
  fallbackProviderProfileId?: string;
  archiveReadScopes: string[];
  archiveIntakeWriteScopes: string[];
  canWriteKnowledgePages: boolean;
  channelIds: string[];
}

export interface ChannelDefinition {
  id: string;
  type: ChannelType;
  label: string;
  owningAgentId: string;
  strategistIdentityId: string;
  enabled: boolean;
  sessionMode: "shared-identity" | "isolated-session";
  workspaceId: string;
  metadata: Record<string, string>;
}

export interface WorkspaceDefinition {
  id: string;
  kind: WorkspaceKind;
  owningEntityId: string;
  title: string;
  visibility: WorkspaceVisibility;
  sharedArtifacts: boolean;
  surfaces: string[];
  channelIds: string[];
}

export interface CoreService {
  id: string;
  label: string;
  status: CoreServiceStatus;
  owner: string;
  description: string;
}

export interface ArchiveActorPolicy {
  actorId: string;
  actorType: ArchiveActorType;
  readScopes: string[];
  intakeWriteScopes: string[];
  canWriteKnowledgePages: boolean;
  canRequestIngest: boolean;
}

export interface ArchivePolicy {
  strategistIdentityId: string;
  ingestServiceId: string;
  intakeRoots: string[];
  knowledgeRoots: string[];
  reviewQueueRoot: string;
  approvalPolicy: {
    defaultTier: ArchiveApprovalTier;
    autoApproveIntents: string[];
    humanReviewSourceTypes: string[];
    humanReviewPageTypes: string[];
    notes: string[];
  };
  actorPolicies: ArchiveActorPolicy[];
  notes: string[];
}

export interface AddOnInstallation {
  addonId: string;
  source: "bundled" | "sideload";
  provenanceTier: AddOnProvenanceTier;
  verificationState: ManifestVerificationState;
  installed: boolean;
  enabled: boolean;
  status: InstallationStatus;
  grantedCapabilities: CapabilityGrant[];
  recommendedGrantPresetIds: string[];
  grantRecommendationSource?: GrantRecommendationSource;
  privateProviderProfileIds: string[];
  notes: string[];
}

export interface StrategistIdentity {
  id: string;
  defaultName: string;
  customName?: string;
  trustNote: string;
}

export interface ConversationMessage {
  id: string;
  threadId: string;
  channelId: string;
  role: ConversationRole;
  author: string;
  content: string;
  createdAt: string;
  archiveCitations?: Array<{
    title: string;
    path: string;
    pageType: string;
    snippet?: string;
  }>;
}

export interface ConversationThread {
  id: string;
  title: string;
  owningAgentId: string;
  workspaceId: string;
  channelId: string;
  summary: string;
  messages: ConversationMessage[];
}

export type RecoveryChecklistStepStatus = "pending" | "active" | "complete";

export interface RecoveryChecklistStep {
  id: string;
  label: string;
  description: string;
  status: RecoveryChecklistStepStatus;
}

export interface RecoverySession {
  active: boolean;
  engineerAgentId: string;
  engineerThreadId: string;
  lastNormalThreadId: string;
  checklist: RecoveryChecklistStep[];
  changeLog: string[];
}

export interface UiPreferences {
  activeSection: "overview" | "strategist" | "archive" | "addons" | "settings";
  activeChatThreadId: string;
  pinnedChatThreadIds: string[];
  leftSidebarOpen: boolean;
  chatSidebarOpen: boolean;
  chatSidebarWidth: number;
  theme: "resonant-dark";
}

export interface ResonantShellState {
  strategistIdentity: StrategistIdentity;
  coreServices: CoreService[];
  providers: ProviderProfile[];
  runtimeNodes: ProviderRuntimeNode[];
  providerRouting: ProviderRoutingState;
  modelStrategy: ModelStrategyState;
  agents: AgentDefinition[];
  channels: ChannelDefinition[];
  workspaces: WorkspaceDefinition[];
  archivePolicy: ArchivePolicy;
  conversationThreads: ConversationThread[];
  recoverySession: RecoverySession;
  installations: Record<string, AddOnInstallation>;
  uiPreferences: UiPreferences;
  distributionModel: "curated-plus-sideload";
}
