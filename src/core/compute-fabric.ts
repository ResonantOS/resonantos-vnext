// Intent citation: docs/architecture/ADR-032-resonantos-compute-fabric.md

import type {
  ComputeAuditRecord,
  ComputeArtifactRecord,
  ComputeJob,
  ComputeJobType,
  ComputeNetworkMode,
  ComputeNode,
  ComputeNodeProbeSummary,
  ComputeNodeRole,
  ComputeNodeTransport,
  ComputeWorkspaceMode,
  ResonantShellState,
} from "./contracts";

export type ComputeFabricValidationSeverity = "error" | "warning";

export type ComputeFabricValidationIssue = {
  severity: ComputeFabricValidationSeverity;
  code: string;
  message: string;
};

export type ComputeFabricValidationResult = {
  valid: boolean;
  issues: ComputeFabricValidationIssue[];
};

export type ComputeJobSubmissionResult = {
  state: ResonantShellState;
  validation: ComputeFabricValidationResult;
  auditRecord?: ComputeAuditRecord;
};

export type ComputeNodeLifecycleResult = {
  state: ResonantShellState;
  validation: ComputeFabricValidationResult;
  auditRecord?: ComputeAuditRecord;
};

export type ComputeNodeEnrollmentInput = {
  actor: string;
  identityFingerprint: string;
  endpoint?: string;
  supportedTransports?: ComputeNodeTransport[];
  roles?: ComputeNodeRole[];
  healthState?: ComputeNode["healthState"];
  probe?: ComputeNodeProbeSummary;
  notes?: string[];
  executableProbePassed?: boolean;
  createdAt?: string;
};

export type ComputeNodeLifecycleInput = {
  actor: string;
  reason: string;
  createdAt?: string;
};

type ComputeNodeSelectionResult = {
  node?: ComputeNode;
  reasons: string[];
};

export const COMPUTE_NODE_ROLES: readonly ComputeNodeRole[] = [
  "shell-runner",
  "safe-command-runner",
  "container-runner",
  "cleanroom-runner",
  "artifact-store",
  "model-host",
  "browser-runner",
  "eval-runner",
  "service-host",
];

export const COMPUTE_JOB_TYPES: readonly ComputeJobType[] = [
  "passive-probe",
  "executable-probe",
  "safe-command",
  "container-job",
  "cleanroom-container-job",
  "service-start",
  "service-stop",
  "artifact-collect",
  "model-endpoint-probe",
  "benchmark-eval",
  "delegated-agent-workspace",
];

export const COMPUTE_NETWORK_MODES: readonly ComputeNetworkMode[] = [
  "none",
  "loopback-only",
  "lan-only",
  "allowlist",
  "internet-approved",
];

const EXECUTABLE_JOB_TYPES = new Set<ComputeJobType>([
  "executable-probe",
  "safe-command",
  "container-job",
  "cleanroom-container-job",
  "service-start",
  "service-stop",
  "model-endpoint-probe",
  "benchmark-eval",
  "delegated-agent-workspace",
]);

const CONTAINER_JOB_TYPES = new Set<ComputeJobType>([
  "container-job",
  "cleanroom-container-job",
  "benchmark-eval",
]);

const SERVICE_JOB_TYPES = new Set<ComputeJobType>(["service-start", "service-stop"]);
const HIGH_RISK_NODE_ROLES = new Set<ComputeNodeRole>([
  "shell-runner",
  "container-runner",
  "cleanroom-runner",
  "browser-runner",
  "eval-runner",
  "service-host",
]);

const SECRET_KEY_PATTERN = /(api[_-]?key|token|secret|password|credential|private[_-]?key|bearer|ssh[_-]?key)/i;
const SECRET_VALUE_PATTERN =
  /(sk-[a-z0-9_-]{12,}|xox[baprs]-[a-z0-9-]{10,}|gh[pousr]_[a-z0-9_]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|Bearer\s+[a-z0-9._-]{16,})/i;

const issue = (
  severity: ComputeFabricValidationSeverity,
  code: string,
  message: string,
): ComputeFabricValidationIssue => ({
  severity,
  code,
  message,
});

const includesUnknown = <T extends string>(values: readonly string[], allowed: readonly T[]): boolean =>
  values.some((value) => !allowed.includes(value as T));

const hasSuspiciousSecret = (value: unknown): boolean => {
  if (typeof value === "string") {
    return SECRET_VALUE_PATTERN.test(value);
  }
  if (!value || typeof value !== "object") {
    return false;
  }
  if (Array.isArray(value)) {
    return value.some(hasSuspiciousSecret);
  }
  return Object.entries(value).some(([key, item]) => {
    if (SECRET_KEY_PATTERN.test(key) && typeof item === "string" && item.trim().length > 0) {
      return true;
    }
    return hasSuspiciousSecret(item);
  });
};

export const isExecutableComputeJob = (job: Pick<ComputeJob, "jobType">): boolean =>
  EXECUTABLE_JOB_TYPES.has(job.jobType);

export const validateComputeNode = (node: ComputeNode): ComputeFabricValidationResult => {
  const issues: ComputeFabricValidationIssue[] = [];

  if (!node.id.trim()) {
    issues.push(issue("error", "missing-node-id", "Compute node must have an id."));
  }
  if (!node.label.trim()) {
    issues.push(issue("error", "missing-node-label", "Compute node must have a label."));
  }
  if (includesUnknown(node.roles, COMPUTE_NODE_ROLES)) {
    issues.push(issue("error", "unknown-node-role", "Compute node declares an unsupported role."));
  }
  if (node.enrollmentState === "enrolled" && !node.identityFingerprint?.trim()) {
    issues.push(issue("error", "enrolled-node-without-fingerprint", "Enrolled compute nodes require an identity fingerprint."));
  }
  if (node.kind !== "desktop-local" && node.enrollmentState === "enrolled" && !node.supportedTransports.length) {
    issues.push(issue("error", "enrolled-node-without-transport", "Enrolled remote compute nodes require a supported transport."));
  }
  if (node.trustTier === "untrusted" && node.enrollmentState === "enrolled") {
    issues.push(issue("error", "untrusted-node-enrolled", "Untrusted compute nodes cannot be marked enrolled."));
  }
  if (node.roles.includes("shell-runner") && !node.roles.includes("safe-command-runner")) {
    issues.push(issue("warning", "shell-without-safe-command", "Shell runner nodes should also expose a safe-command role."));
  }

  return { valid: issues.every((entry) => entry.severity !== "error"), issues };
};

export const validateComputeJob = (
  job: ComputeJob,
  state: Pick<ResonantShellState, "computeFabric">,
  options: { allowDirectNodeSelection?: boolean } = {},
): ComputeFabricValidationResult => {
  const issues: ComputeFabricValidationIssue[] = [];
  const nodes = state.computeFabric.nodes;
  const targetNode = job.targetNodeId ? nodes.find((node) => node.id === job.targetNodeId) : undefined;
  const selectedNode = targetNode ? undefined : selectComputeNodeForJob(nodes, job);

  if (!job.id.trim()) {
    issues.push(issue("error", "missing-job-id", "Compute job must have an id."));
  }
  if (!COMPUTE_JOB_TYPES.includes(job.jobType)) {
    issues.push(issue("error", "unknown-job-type", "Compute job type is unsupported."));
  }
  if (!job.requiredNodeRoles.length) {
    issues.push(issue("error", "missing-node-role", "Compute job must declare at least one required node role."));
  }
  if (job.targetNodeId && !targetNode) {
    issues.push(issue("error", "target-node-not-found", "Compute job target node is not registered."));
  }
  if (includesUnknown(job.requiredNodeRoles, COMPUTE_NODE_ROLES)) {
    issues.push(issue("error", "unknown-required-role", "Compute job requires an unsupported node role."));
  }
  if (!COMPUTE_NETWORK_MODES.includes(job.networkPolicy.mode)) {
    issues.push(issue("error", "unknown-network-mode", "Compute job network mode is unsupported."));
  }
  if (!job.networkPolicy.reason.trim()) {
    issues.push(issue("error", "missing-network-reason", "Compute job must explain its network policy."));
  }
  if (job.networkPolicy.mode === "allowlist" && !job.networkPolicy.allowlist?.length) {
    issues.push(issue("error", "empty-network-allowlist", "Allowlist network mode requires at least one host or CIDR entry."));
  }
  if (job.networkPolicy.mode === "internet-approved" && !job.approvalPolicy.humanApprovalRequired && !job.approvalPolicy.approvedBy) {
    issues.push(issue("error", "internet-without-approval", "Internet-approved compute jobs require explicit human approval."));
  }
  if (job.jobType === "passive-probe") {
    if (job.command || job.container) {
      issues.push(issue("error", "passive-probe-has-execution", "Passive probes must not declare commands or containers."));
    }
    if (job.networkPolicy.mode !== "none") {
      issues.push(issue("error", "passive-probe-network", "Passive probes must not request network access."));
    }
  }
  if (isExecutableComputeJob(job)) {
    if (targetNode) {
      if (targetNode.enrollmentState !== "enrolled") {
        issues.push(issue("error", "target-node-not-enrolled", "Executable compute jobs require an enrolled target node."));
      }
      if (targetNode.healthState === "unavailable") {
        issues.push(issue("error", "target-node-unavailable", "Executable compute jobs cannot target an unavailable node."));
      }
      const missingRoles = job.requiredNodeRoles.filter((role) => !targetNode.roles.includes(role));
      if (missingRoles.length) {
        issues.push(issue("error", "target-node-missing-role", `Target node is missing required roles: ${missingRoles.join(", ")}.`));
      }
      const selection = evaluateComputeNodeForJob(targetNode, job);
      if (!selection.node) {
        issues.push(issue("error", "target-node-constraints-mismatch", `Target node does not satisfy job constraints: ${selection.reasons.join(", ")}.`));
      }
    }
    if (!targetNode && !selectedNode) {
      issues.push(issue("error", "no-enrolled-node-for-job", "No enrolled compute node satisfies the requested roles and constraints."));
    }
  }
  if (job.targetNodeId && job.consumerId.startsWith("addon.") && !options.allowDirectNodeSelection) {
    issues.push(issue("error", "addon-direct-node-selection", "Add-ons cannot choose compute nodes directly; ResonantOS must select the node."));
  }
  if (CONTAINER_JOB_TYPES.has(job.jobType) && !job.requiredNodeRoles.includes("container-runner")) {
    issues.push(issue("error", "container-job-without-role", "Container jobs require the container-runner role."));
  }
  if (job.jobType === "cleanroom-container-job" && !job.requiredNodeRoles.includes("cleanroom-runner")) {
    issues.push(issue("error", "cleanroom-job-without-role", "Cleanroom jobs require the cleanroom-runner role."));
  }
  if (job.jobType === "cleanroom-container-job" && !["none", "allowlist"].includes(job.networkPolicy.mode)) {
    issues.push(issue("error", "cleanroom-unsafe-network", "Cleanroom jobs must use no network or an explicit allowlist."));
  }
  if (SERVICE_JOB_TYPES.has(job.jobType) && !job.requiredNodeRoles.includes("service-host")) {
    issues.push(issue("error", "service-job-without-role", "Service jobs require the service-host role."));
  }
  if (!job.secretPolicy.allowRawSecrets && hasSuspiciousSecret(job)) {
    issues.push(issue("error", "secret-material-in-job", "Compute job appears to contain raw secret material."));
  }
  if (job.secretPolicy.exposure !== "none" && !job.secretPolicy.allowRawSecrets && !job.secretPolicy.approvedSecretRefs.length) {
    issues.push(issue("error", "secret-exposure-without-approval", "Secret exposure requires approved secret references."));
  }
  if (job.workspacePolicy.mode === "cleanroom" && job.networkPolicy.mode === "internet-approved") {
    issues.push(issue("error", "cleanroom-internet", "Cleanroom workspaces cannot use unrestricted internet access."));
  }
  if (job.workspacePolicy.cleanup !== "retain-for-review" && job.artifactPolicy.retention === "review") {
    issues.push(issue("warning", "review-artifacts-with-cleanup", "Review artifacts should retain the workspace until collection completes."));
  }
  if (job.artifactPolicy.maxFileBytes <= 0 || job.artifactPolicy.maxTotalBytes <= 0 || job.artifactPolicy.maxFileCount <= 0) {
    issues.push(issue("error", "invalid-artifact-limits", "Compute jobs require positive artifact size and count limits."));
  }
  if (job.timeoutPolicy.executionTimeoutSeconds <= 0 || job.timeoutPolicy.cancellationGraceSeconds <= 0) {
    issues.push(issue("error", "invalid-timeout-policy", "Compute jobs require positive execution and cancellation timeouts."));
  }

  return { valid: issues.every((entry) => entry.severity !== "error"), issues };
};

export const selectComputeNodeForJob = (
  nodes: ComputeNode[],
  job: Pick<ComputeJob, "requiredNodeRoles" | "constraints" | "networkPolicy">,
): ComputeNode | undefined =>
  nodes.find((node) => evaluateComputeNodeForJob(node, job).node);

export const submitComputeJob = (
  state: ResonantShellState,
  job: ComputeJob,
  options: { allowDirectNodeSelection?: boolean; createdAt?: string } = {},
): ComputeJobSubmissionResult => {
  const validation = validateComputeJob(job, state, options);
  if (!validation.valid) {
    return { state, validation };
  }

  const submittedJob: ComputeJob = {
    ...job,
    targetNodeId: job.targetNodeId ?? selectComputeNodeForJob(state.computeFabric.nodes, job)?.id,
    status: job.status === "blocked" || job.status === "failed" || job.status === "cancelled" ? "queued" : job.status,
  };
  const createdAt = options.createdAt ?? new Date().toISOString();
  const auditRecord: ComputeAuditRecord = {
    id: `compute-audit-${submittedJob.id}-${state.computeFabric.audit.length + 1}`,
    jobId: submittedJob.id,
    nodeId: submittedJob.targetNodeId,
    createdAt,
    event: "submitted",
    detail: `Compute job ${submittedJob.id} submitted by ${submittedJob.consumerId}.`,
    metadata: {
      jobType: submittedJob.jobType,
      requiredNodeRoles: submittedJob.requiredNodeRoles,
      networkMode: submittedJob.networkPolicy.mode,
      workspaceMode: submittedJob.workspacePolicy.mode,
    },
  };

  return {
    validation,
    auditRecord,
    state: {
      ...state,
      computeFabric: {
        ...state.computeFabric,
        jobs: [...state.computeFabric.jobs.filter((item) => item.id !== submittedJob.id), submittedJob],
        audit: [...state.computeFabric.audit, auditRecord],
      },
    },
  };
};

export const enrollComputeNode = (
  state: ResonantShellState,
  nodeId: string,
  input: ComputeNodeEnrollmentInput,
): ComputeNodeLifecycleResult => {
  const currentNode = state.computeFabric.nodes.find((node) => node.id === nodeId);
  const issues: ComputeFabricValidationIssue[] = [];

  if (!currentNode) {
    issues.push(issue("error", "node-not-found", "Compute node is not registered."));
  }
  if (!input.actor.trim()) {
    issues.push(issue("error", "missing-actor", "Compute node enrollment requires an actor."));
  }
  if (!input.identityFingerprint.trim()) {
    issues.push(issue("error", "missing-identity-fingerprint", "Compute node enrollment requires an identity fingerprint."));
  }
  if (currentNode?.enrollmentState === "revoked") {
    issues.push(issue("error", "revoked-node-enrollment", "Revoked compute nodes cannot be re-enrolled in place."));
  }
  if (currentNode?.trustTier === "untrusted") {
    issues.push(issue("error", "untrusted-node-enrollment", "Untrusted compute nodes cannot be enrolled."));
  }

  const nextRoles = input.roles ?? currentNode?.roles ?? [];
  const highRiskRoles = nextRoles.filter((role) => HIGH_RISK_NODE_ROLES.has(role));
  if (highRiskRoles.length && !input.executableProbePassed) {
    issues.push(issue("error", "executable-role-without-probe", `Executable roles require a passed executable probe: ${highRiskRoles.join(", ")}.`));
  }

  if (issues.some((entry) => entry.severity === "error") || !currentNode) {
    return { state, validation: { valid: false, issues } };
  }

  const enrolledNode: ComputeNode = {
    ...currentNode,
    enrollmentState: "enrolled",
    endpoint: input.endpoint ?? currentNode.endpoint,
    identityFingerprint: input.identityFingerprint,
    supportedTransports: input.supportedTransports ?? currentNode.supportedTransports,
    roles: nextRoles,
    healthState: input.healthState ?? "unknown",
    lastVerifiedAt: input.createdAt,
    probe: input.probe ? { ...currentNode.probe, ...input.probe } : currentNode.probe,
    notes: [...(input.notes ?? []), ...(currentNode.notes ?? [])],
  };
  const validation = validateComputeNode(enrolledNode);
  if (!validation.valid) {
    return { state, validation };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const auditRecord = computeNodeAuditRecord({
    state,
    node: enrolledNode,
    createdAt,
    event: "enrolled",
    actor: input.actor,
    detail: `Compute node ${enrolledNode.id} enrolled by ${input.actor}.`,
    metadata: {
      roles: enrolledNode.roles,
      transports: enrolledNode.supportedTransports,
      endpoint: enrolledNode.endpoint,
      probeOs: enrolledNode.probe?.os,
      probeArch: enrolledNode.probe?.arch,
    },
  });

  return {
    validation,
    auditRecord,
    state: replaceComputeNodeWithAudit(state, enrolledNode, auditRecord),
  };
};

export const quarantineComputeNode = (
  state: ResonantShellState,
  nodeId: string,
  input: ComputeNodeLifecycleInput,
): ComputeNodeLifecycleResult => transitionComputeNodeState(state, nodeId, "quarantined", input);

export const revokeComputeNode = (
  state: ResonantShellState,
  nodeId: string,
  input: ComputeNodeLifecycleInput,
): ComputeNodeLifecycleResult => transitionComputeNodeState(state, nodeId, "revoked", input);

export const isRootContainedArtifactPath = (artifactRoot: string, artifactPath: string): boolean => {
  const rawTargetParts = artifactPath.replace(/\\/g, "/").split("/");
  if (!isAbsolutePath(artifactPath) && rawTargetParts.includes("..")) {
    return false;
  }
  const root = normalizePathParts(artifactRoot);
  const target = normalizePathParts(artifactPath);
  if (!root.length || !target.length || artifactPath.includes("\0")) {
    return false;
  }
  if (isAbsolutePath(artifactPath)) {
    return startsWithParts(target, root);
  }
  return !target.includes("..");
};

export const validateComputeArtifactRecord = (
  artifact: ComputeArtifactRecord,
  artifactRoot: string,
): ComputeFabricValidationResult => {
  const issues: ComputeFabricValidationIssue[] = [];

  if (!isRootContainedArtifactPath(artifactRoot, artifact.path)) {
    issues.push(issue("error", "artifact-path-outside-root", "Compute artifact path must stay inside the artifact root."));
  }
  if (artifact.sizeBytes < 0) {
    issues.push(issue("error", "negative-artifact-size", "Compute artifact size cannot be negative."));
  }
  if (!/^[a-f0-9]{64}$/i.test(artifact.sha256)) {
    issues.push(issue("error", "invalid-artifact-hash", "Compute artifact hash must be a SHA-256 hex digest."));
  }

  return { valid: issues.every((entry) => entry.severity !== "error"), issues };
};

const normalizePathParts = (value: string): string[] => {
  const parts: string[] = [];
  value.replace(/\\/g, "/").split("/").forEach((part) => {
    if (!part || part === ".") {
      return;
    }
    if (part === "..") {
      parts.pop();
      return;
    }
    parts.push(part);
  });
  return parts;
};

const isAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(value);

const startsWithParts = (target: string[], root: string[]): boolean =>
  root.every((part, index) => target[index] === part);

const transitionComputeNodeState = (
  state: ResonantShellState,
  nodeId: string,
  enrollmentState: "quarantined" | "revoked",
  input: ComputeNodeLifecycleInput,
): ComputeNodeLifecycleResult => {
  const currentNode = state.computeFabric.nodes.find((node) => node.id === nodeId);
  const issues: ComputeFabricValidationIssue[] = [];

  if (!currentNode) {
    issues.push(issue("error", "node-not-found", "Compute node is not registered."));
  }
  if (!input.actor.trim()) {
    issues.push(issue("error", "missing-actor", "Compute node lifecycle transition requires an actor."));
  }
  if (!input.reason.trim()) {
    issues.push(issue("error", "missing-lifecycle-reason", "Compute node lifecycle transition requires a reason."));
  }
  if (currentNode?.enrollmentState === "revoked" && enrollmentState !== "revoked") {
    issues.push(issue("error", "revoked-node-transition", "Revoked compute nodes cannot transition without new enrollment."));
  }
  if (issues.some((entry) => entry.severity === "error") || !currentNode) {
    return { state, validation: { valid: false, issues } };
  }

  const createdAt = input.createdAt ?? new Date().toISOString();
  const nextNode: ComputeNode = {
    ...currentNode,
    enrollmentState,
    healthState: enrollmentState === "revoked" ? "unavailable" : "unknown",
    lastVerifiedAt: createdAt,
    notes: [`${enrollmentState}: ${input.reason}`, ...(currentNode.notes ?? [])],
  };
  const validation = validateComputeNode(nextNode);
  if (!validation.valid) {
    return { state, validation };
  }

  const auditRecord = computeNodeAuditRecord({
    state,
    node: nextNode,
    createdAt,
    event: enrollmentState,
    actor: input.actor,
    detail: `Compute node ${nextNode.id} ${enrollmentState} by ${input.actor}: ${input.reason}`,
    metadata: {
      reason: input.reason,
      previousEnrollmentState: currentNode.enrollmentState,
      previousHealthState: currentNode.healthState,
    },
  });

  return {
    validation,
    auditRecord,
    state: replaceComputeNodeWithAudit(state, nextNode, auditRecord),
  };
};

const computeNodeAuditRecord = (input: {
  state: ResonantShellState;
  node: ComputeNode;
  createdAt: string;
  event: ComputeAuditRecord["event"];
  actor: string;
  detail: string;
  metadata: Record<string, unknown>;
}): ComputeAuditRecord => ({
  id: `compute-audit-${input.node.id}-${input.event}-${input.state.computeFabric.audit.length + 1}`,
  jobId: `compute-node-${input.node.id}`,
  nodeId: input.node.id,
  createdAt: input.createdAt,
  event: input.event,
  detail: input.detail,
  metadata: {
    actor: input.actor,
    ...input.metadata,
  },
});

const replaceComputeNodeWithAudit = (
  state: ResonantShellState,
  node: ComputeNode,
  auditRecord: ComputeAuditRecord,
): ResonantShellState => ({
  ...state,
  computeFabric: {
    ...state.computeFabric,
    nodes: state.computeFabric.nodes.map((item) => (item.id === node.id ? node : item)),
    audit: [...state.computeFabric.audit, auditRecord],
  },
});

const evaluateComputeNodeForJob = (
  node: ComputeNode,
  job: Pick<ComputeJob, "requiredNodeRoles" | "constraints" | "networkPolicy">,
): ComputeNodeSelectionResult => {
  const reasons: string[] = [];

  if (node.enrollmentState !== "enrolled") {
    reasons.push("node is not enrolled");
  }
  if (node.healthState === "unavailable") {
    reasons.push("node is unavailable");
  }
  const missingRoles = job.requiredNodeRoles.filter((role) => !node.roles.includes(role));
  if (missingRoles.length) {
    reasons.push(`missing roles: ${missingRoles.join(", ")}`);
  }
  if (job.constraints.os?.length && (!node.probe?.os || !job.constraints.os.includes(node.probe.os))) {
    reasons.push("os constraint not satisfied");
  }
  if (job.constraints.arch?.length && (!node.probe?.arch || !job.constraints.arch.includes(node.probe.arch))) {
    reasons.push("arch constraint not satisfied");
  }
  if (job.constraints.containerRuntime?.length) {
    const runtimes = node.probe?.containerRuntimes ?? [];
    if (!job.constraints.containerRuntime.every((runtime) => runtimes.includes(runtime))) {
      reasons.push("container runtime constraint not satisfied");
    }
  }
  if (job.constraints.containerPlatform?.length) {
    const platforms = node.probe?.containerPlatforms ?? [];
    if (!job.constraints.containerPlatform.every((platform) => platforms.includes(platform))) {
      reasons.push("container platform constraint not satisfied");
    }
  }
  if (job.constraints.minRamGb && (node.probe?.ramGb ?? 0) < job.constraints.minRamGb) {
    reasons.push("memory constraint not satisfied");
  }
  if (job.constraints.networkModes?.length && !job.constraints.networkModes.includes(job.networkPolicy.mode)) {
    reasons.push("network mode constraint not satisfied");
  }

  return { node: reasons.length ? undefined : node, reasons };
};
