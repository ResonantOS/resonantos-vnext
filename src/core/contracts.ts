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
export type ConversationMessageStatus = "complete" | "interrupted" | "failed";
export type ChatRunPhase = "idle" | "thinking" | "retrieving" | "streaming" | "tool-running" | "interrupted" | "failed" | "completed";
export type ConversationTranscriptEventAction =
  | "thread-created"
  | "thread-branched"
  | "message-appended"
  | "message-edit-requested"
  | "message-deleted"
  | "generation-interrupted"
  | "context-compacted";
export type AddOnProvenanceTier = "bundled-core" | "curated-signed" | "enterprise-signed" | "sideloaded-unverified";
export type ManifestVerificationState = "verified" | "unverified" | "not-applicable" | "failed";
export type GrantRecommendationSource = "manifest-request" | "preset-bundle" | "manual";
export type RuntimeIsolationBoundary =
  | "shell-ui"
  | "embedded-surface"
  | "host-mediated-service"
  | "host-mediated-agent"
  | "host-mediated-channel";
export type DelegationTaskType =
  | "code-change"
  | "bug-fix"
  | "research"
  | "browser-inspection"
  | "knowledge-organization"
  | "archive-prep"
  | "communication"
  | "system-diagnosis"
  | "system-repair"
  | "design"
  | "routine-work";
export type DelegationTargetRuntime =
  | "native-agent"
  | "addon-agent"
  | "embedded-workspace"
  | "local-service"
  | "terminal-service"
  | "external-agent";
export type DelegationArtifactType =
  | "summary"
  | "markdown"
  | "diff"
  | "file-list"
  | "log"
  | "citation-bundle"
  | "diagnostic-report"
  | "verification-report"
  | "archive-intake-bundle";
export type DelegationApprovalReason = "destructive" | "public-action" | "financial" | "identity-sensitive" | "broad-filesystem";
export type NativeToolCapability =
  | "research.search_api"
  | "research.fetch_url"
  | "browser.session"
  | "filesystem.read"
  | "filesystem.search"
  | "filesystem.patch"
  | "process.safe_command"
  | "provider.probe"
  | "provider.route_select"
  | "archive.search"
  | "archive.read"
  | "archive.intake_write"
  | "delegation.create_packet"
  | "delegation.render_task_markdown"
  | "delegation.dispatch"
  | "delegation.monitor"
  | "delegation.collect_artifacts"
  | "delegation.verify_result"
  | "addon.health_check"
  | "addon.enable_disable";

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

export interface AddOnDelegationContract {
  acceptsTasks: boolean;
  taskTypes: DelegationTaskType[];
  artifactReturnTypes: DelegationArtifactType[];
  defaultTargetRuntime: DelegationTargetRuntime;
  requiresHumanApprovalBeforeExecution: boolean;
  notes?: string[];
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
  delegation?: AddOnDelegationContract;
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
  modelContext?: ProviderModelContextPolicy[];
  consumerScopes: string[];
  shared: boolean;
  status: ProviderStatus;
  credentialStatus: "configured" | "missing";
}

export interface ProviderModelContextPolicy {
  model: string;
  maxContextTokens: number;
  tokenEstimateMethod: "provider-metadata" | "local-tokenizer" | "heuristic";
  reservedOutputTokens?: number;
  reservedReasoningTokens?: number;
  reservedSystemTokens?: number;
  reservedRetrievalTokens?: number;
  source: "provider-default" | "runtime-node" | "user-config";
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
  supportsStreaming: boolean;
  supportsAbort: boolean;
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

export interface DelegationTarget {
  id: string;
  label: string;
  runtime: DelegationTargetRuntime;
  addonId?: string;
  agentId?: string;
  acceptedTaskTypes: DelegationTaskType[];
  supportedArtifactTypes: DelegationArtifactType[];
  requiredCapabilities: Array<Capability | NativeToolCapability>;
  defaultRequiresHumanApproval: boolean;
}

export interface DelegationReturnProtocol {
  summaryRequired: boolean;
  artifactTypes: DelegationArtifactType[];
  mustReportFilesChanged: boolean;
  mustReportCommandsRun: boolean;
  mustReportResidualRisks: boolean;
  mustReportVerification: boolean;
}

export interface DelegationVerificationRequirement {
  id: string;
  label: string;
  method: "unit-test" | "build" | "lint" | "manual-review" | "source-citation" | "runtime-check" | "none";
  required: boolean;
}

export interface DelegationCostPolicy {
  sensitivity: "low" | "medium" | "high";
  preferredCostTier: "free-local" | "subscription" | "paid-api" | "best-available";
  allowPaidEscalation: boolean;
  rationale: string;
}

export interface DelegationProviderPolicy {
  preferredProviderProfileIds: string[];
  preferredRuntimeNodeIds: string[];
  preferredModels: string[];
  allowedRuntimeKinds: RuntimeNodeKind[];
  fallbackPolicyId?: string;
}

export interface DelegationPacket {
  id: string;
  createdAt: string;
  createdByAgentId: string;
  targetAgentId: string;
  targetRuntime: DelegationTargetRuntime;
  taskType: DelegationTaskType;
  mission: string;
  context: string;
  sourceMemoryRefs: string[];
  systemMemoryRefs: string[];
  workspaceId: string;
  filesInScope: string[];
  allowedTools: NativeToolCapability[];
  forbiddenActions: string[];
  capabilityGrants: CapabilityGrant[];
  providerPolicy: DelegationProviderPolicy;
  costPolicy: DelegationCostPolicy;
  humanApprovalRequired: boolean;
  approvalReasons: DelegationApprovalReason[];
  verificationRequirements: DelegationVerificationRequirement[];
  expectedArtifacts: DelegationArtifactType[];
  returnProtocol: DelegationReturnProtocol;
  auditLogPath: string;
}

export interface TaskWorkspace {
  id: string;
  packetId: string;
  rootPath: string;
  packetPath: string;
  taskMarkdownPath: string;
  artifactsPath: string;
  logsPath: string;
  resultPath: string;
  verificationPath: string;
}

export interface TaskWorkspacePayload {
  workspace: TaskWorkspace;
  packet: DelegationPacket;
  taskMarkdown: string;
  resultMarkdown: string;
  verification: Record<string, unknown>;
}

export interface FinishTaskWorkspaceResult {
  workspace: TaskWorkspace;
  resultPath: string;
  verificationPath: string;
  auditPath: string;
}

export interface ArtifactReturn {
  packetId: string;
  targetAgentId: string;
  returnedAt: string;
  summary: string;
  artifacts: Array<{
    type: DelegationArtifactType;
    path?: string;
    content?: string;
  }>;
  filesChanged: string[];
  commandsRun: string[];
  verification: Array<{
    requirementId: string;
    status: "passed" | "failed" | "not-run";
    evidence: string;
  }>;
  residualRisks: string[];
}

export interface DelegationValidationIssue {
  severity: "error" | "warning";
  code: string;
  message: string;
}

export interface DelegationValidationResult {
  valid: boolean;
  issues: DelegationValidationIssue[];
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
  status?: ConversationMessageStatus;
  archiveCitations?: Array<{
    title: string;
    path: string;
    pageType: string;
    snippet?: string;
  }>;
  providerUsage?: ProviderUsageTelemetry;
}

export interface ProviderUsageTelemetry {
  providerId: string;
  model: string;
  source: "provider" | "local-runtime";
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
}

export interface ContextDecision {
  decisionId: string;
  title: string;
  decision: string;
  reason: string;
  scope: string;
  status: "proposed" | "accepted" | "superseded";
  sourceMessageIds: string[];
  relatedDocPaths: string[];
}

export interface ContextFact {
  factId: string;
  statement: string;
  scope: "user" | "project" | "system" | "external";
  confidence: "verified" | "unverified";
  observedAt: string;
  sourceMessageIds: string[];
}

export interface ContextPreference {
  preferenceId: string;
  statement: string;
  appliesTo: string;
  sourceMessageIds: string[];
}

export interface ContextTask {
  taskId: string;
  owner: string;
  status: "open" | "blocked" | "done";
  description: string;
  blockingReason?: string;
  verificationRequired: string[];
  sourceMessageIds: string[];
}

export interface ContextArtifactRef {
  artifactId: string;
  kind: "file" | "commit" | "archive-document" | "screenshot" | "addon-manifest" | "external-url" | "other";
  label: string;
  ref: string;
  sourceMessageIds: string[];
}

export interface ContextRisk {
  riskId: string;
  description: string;
  severity: "low" | "medium" | "high";
  mitigation?: string;
  sourceMessageIds: string[];
}

export interface ContextQuestion {
  questionId: string;
  question: string;
  owner: "user" | "agent" | "unknown";
  sourceMessageIds: string[];
}

export interface ContextMemoryState {
  threadId: string;
  compactedAt: string;
  sourceRange: {
    fromMessageId: string;
    toMessageId: string;
  };
  userIntent: {
    goal: string;
    why: string;
    successCriteria: string[];
    prioritySignals: string[];
    sourceMessageIds: string[];
  };
  workingSummary: string;
  decisions: ContextDecision[];
  facts: ContextFact[];
  preferences: ContextPreference[];
  openTasks: ContextTask[];
  artifacts: ContextArtifactRef[];
  risks: ContextRisk[];
  unresolvedQuestions: ContextQuestion[];
  preservedRecentMessageIds: string[];
  checksum: string;
}

export interface ContextBudget {
  providerId: string;
  modelId: string;
  maxContextTokens: number;
  usedInputTokens: number;
  reservedOutputTokens: number;
  reservedReasoningTokens: number;
  reservedSystemTokens: number;
  reservedRetrievalTokens: number;
  compactionThreshold: number;
  hardStopThreshold: number;
  estimateQuality: "provider" | "tokenizer" | "heuristic";
}

export interface CompactionRequest {
  threadId: string;
  agentId: string;
  providerRouteId: string;
  reason: "manual" | "threshold" | "provider_limit" | "branch" | "session_close";
  sourceMessageIds: string[];
  instructions?: string;
}

export interface ConversationTranscriptEvent {
  id: string;
  createdAt: string;
  action: ConversationTranscriptEventAction;
  threadId: string;
  channelId?: string;
  messageId?: string;
  role?: ConversationRole;
  agentId?: string;
  sourceThreadId?: string;
  sourceMessageId?: string;
  payload: Record<string, unknown>;
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
  transcriptLedger: ConversationTranscriptEvent[];
  contextMemoryStates: ContextMemoryState[];
  recoverySession: RecoverySession;
  installations: Record<string, AddOnInstallation>;
  uiPreferences: UiPreferences;
  distributionModel: "curated-plus-sideload";
}
