// Intent citation: docs/architecture/ADR-032-resonantos-compute-fabric.md

import type {
  ComputeAuditRecord,
  ComputeArtifactRecord,
  ComputeJob,
  ComputePassiveDiagnosticsResult,
  ComputeSafeCommandRequest,
  ComputeSafeCommandResult,
  ResonantShellState,
} from "../../core/contracts";
import {
  quarantineComputeNode,
  revokeComputeNode,
  submitComputeJob,
  type ComputeFabricValidationResult,
} from "../../core/compute-fabric";

type ComputePassiveDiagnosticsApplyResult = {
  state: ResonantShellState;
  validation: ComputeFabricValidationResult;
};

type ComputeLifecycleActionResult = ComputePassiveDiagnosticsApplyResult;

type ComputeSafeCommandSubmissionResult = ComputePassiveDiagnosticsApplyResult & {
  request?: ComputeSafeCommandRequest;
};

const passiveDiagnosticsJobFor = (diagnostics: ComputePassiveDiagnosticsResult): ComputeJob => ({
  id: `compute-passive-diagnostics-${diagnostics.nodeId}`,
  createdAt: diagnostics.checkedAt,
  createdBy: "compute-fabric.core",
  consumerId: "core.compute-fabric",
  purpose: "Record passive local compute diagnostics.",
  jobType: "passive-probe",
  requiredNodeRoles: ["artifact-store"],
  constraints: {
    os: [diagnostics.os],
    arch: [diagnostics.arch],
  },
  targetNodeId: diagnostics.nodeId,
  workspacePolicy: {
    mode: "ephemeral",
    cleanup: "delete-on-success",
  },
  networkPolicy: {
    mode: "none",
    reason: "Passive local diagnostics do not use network access.",
  },
  filesystemPolicy: {
    readRoots: [],
    writeRoots: [],
    allowSymlinks: false,
    allowArchiveExtraction: false,
  },
  secretPolicy: {
    allowRawSecrets: false,
    approvedSecretRefs: [],
    exposure: "none",
    redactionRequired: true,
  },
  artifactPolicy: {
    expectedTypes: ["diagnostic-report"],
    maxFileBytes: 64_000,
    maxTotalBytes: 64_000,
    maxFileCount: 1,
    retention: "review",
    archiveIntakeAllowed: false,
  },
  approvalPolicy: {
    humanApprovalRequired: false,
    approvalReasons: [],
  },
  costPolicy: {
    sensitivity: "high",
    preferredCostTier: "free-local",
    allowPaidEscalation: false,
    rationale: "Passive host facts are collected locally without provider spend.",
  },
  timeoutPolicy: {
    queueTimeoutSeconds: 10,
    executionTimeoutSeconds: 10,
    cancellationGraceSeconds: 1,
  },
  auditLogPath: "compute/audit.jsonl",
  status: "succeeded",
});

const localSafeCommandProbeJobFor = (createdAt: string): ComputeJob => ({
  id: "compute-local-safe-command-probe",
  createdAt,
  createdBy: "compute-fabric.core",
  consumerId: "core.compute-fabric",
  purpose: "Run local safe command probe.",
  jobType: "safe-command",
  requiredNodeRoles: ["safe-command-runner"],
  constraints: {},
  targetNodeId: "compute-desktop-local",
  workspacePolicy: {
    mode: "ephemeral",
    cleanup: "delete-on-success",
  },
  networkPolicy: {
    mode: "none",
    reason: "The local safe command probe does not use network access.",
  },
  filesystemPolicy: {
    readRoots: [],
    writeRoots: [],
    allowSymlinks: false,
    allowArchiveExtraction: false,
  },
  secretPolicy: {
    allowRawSecrets: false,
    approvedSecretRefs: [],
    exposure: "none",
    redactionRequired: true,
  },
  artifactPolicy: {
    expectedTypes: ["diagnostic-report"],
    maxFileBytes: 64_000,
    maxTotalBytes: 64_000,
    maxFileCount: 1,
    retention: "review",
    archiveIntakeAllowed: false,
  },
  approvalPolicy: {
    humanApprovalRequired: false,
    approvalReasons: [],
  },
  costPolicy: {
    sensitivity: "high",
    preferredCostTier: "free-local",
    allowPaidEscalation: false,
    rationale: "The probe uses a host-mediated local allowlist.",
  },
  timeoutPolicy: {
    queueTimeoutSeconds: 10,
    executionTimeoutSeconds: 10,
    cancellationGraceSeconds: 1,
  },
  auditLogPath: "compute/audit.jsonl",
  command: {
    command: ["uname", "-s", "-m", "-r"],
  },
  status: "queued",
});

export const applyComputePassiveDiagnostics = (
  state: ResonantShellState,
  diagnostics: ComputePassiveDiagnosticsResult,
): ComputePassiveDiagnosticsApplyResult => {
  const nodeUpdatedState: ResonantShellState = {
    ...state,
    computeFabric: {
      ...state.computeFabric,
      nodes: state.computeFabric.nodes.map((node) =>
        node.id === diagnostics.nodeId
          ? {
              ...node,
              healthState: node.healthState === "unavailable" ? "unknown" : node.healthState,
              lastVerifiedAt: diagnostics.checkedAt,
              probe: {
                ...node.probe,
                os: diagnostics.os,
                arch: diagnostics.arch,
                checkedAt: diagnostics.checkedAt,
              },
              notes: [
                diagnostics.summary,
                ...(node.notes ?? []).filter((note) => note !== diagnostics.summary),
              ],
            }
          : node,
      ),
    },
  };

  const submission = submitComputeJob(nodeUpdatedState, passiveDiagnosticsJobFor(diagnostics), {
    createdAt: diagnostics.checkedAt,
  });

  if (!submission.validation.valid) {
    return { state, validation: submission.validation };
  }

  return {
    validation: submission.validation,
    state: {
      ...submission.state,
      computeFabric: {
        ...submission.state.computeFabric,
        audit: [
          ...submission.state.computeFabric.audit,
          {
            id: `compute-audit-passive-diagnostics-${diagnostics.nodeId}-${submission.state.computeFabric.audit.length + 1}`,
            jobId: `compute-passive-diagnostics-${diagnostics.nodeId}`,
            nodeId: diagnostics.nodeId,
            createdAt: diagnostics.checkedAt,
            event: "completed",
            detail: diagnostics.summary,
            metadata: {
              os: diagnostics.os,
              arch: diagnostics.arch,
              family: diagnostics.family,
              executableSuffix: diagnostics.executableSuffix,
            },
          },
        ],
      },
    },
  };
};

export const quarantineComputeNodeForReview = (
  state: ResonantShellState,
  nodeId: string,
  reason: string,
  createdAt = new Date().toISOString(),
): ComputeLifecycleActionResult =>
  quarantineComputeNode(state, nodeId, {
    actor: "compute-fabric.core",
    reason,
    createdAt,
  });

export const revokeComputeNodeTrust = (
  state: ResonantShellState,
  nodeId: string,
  reason: string,
  createdAt = new Date().toISOString(),
): ComputeLifecycleActionResult =>
  revokeComputeNode(state, nodeId, {
    actor: "compute-fabric.core",
    reason,
    createdAt,
  });

export const submitLocalSafeCommandProbe = (
  state: ResonantShellState,
  createdAt = new Date().toISOString(),
): ComputeSafeCommandSubmissionResult => {
  const job = localSafeCommandProbeJobFor(createdAt);
  const submission = submitComputeJob(state, job, { createdAt });
  if (!submission.validation.valid) {
    return { state, validation: submission.validation };
  }

  return {
    state: submission.state,
    validation: submission.validation,
    request: {
      nodeId: "compute-desktop-local",
      jobId: job.id,
      command: job.command?.command ?? [],
    },
  };
};

export const applyComputeSafeCommandResult = (
  state: ResonantShellState,
  result: ComputeSafeCommandResult,
): ResonantShellState => {
  const jobId = result.jobId ?? `compute-safe-command-${result.nodeId}`;
  const artifacts = safeCommandArtifactsFor(jobId, result);
  const auditRecord: ComputeAuditRecord = {
    id: `compute-audit-safe-command-${jobId}-${state.computeFabric.audit.length + 1}`,
    jobId,
    nodeId: result.nodeId,
    createdAt: result.completedAt,
    event: result.status === "succeeded" ? "completed" : "failed",
    detail: result.summary,
    metadata: {
      command: result.command,
      exitCode: result.exitCode,
      stdoutBytes: result.stdout.length,
      stderrBytes: result.stderr.length,
      artifactIds: artifacts.map((artifact) => artifact.id),
    },
  };

  return {
    ...state,
    computeFabric: {
      ...state.computeFabric,
      jobs: state.computeFabric.jobs.map((job) =>
        job.id === jobId
          ? {
              ...job,
              status: result.status,
            }
          : job,
      ),
      artifacts: [
        ...state.computeFabric.artifacts.filter((artifact) => !artifacts.some((nextArtifact) => nextArtifact.id === artifact.id)),
        ...artifacts,
      ],
      audit: [...state.computeFabric.audit, auditRecord],
    },
  };
};

const safeCommandArtifactsFor = (
  jobId: string,
  result: ComputeSafeCommandResult,
): ComputeArtifactRecord[] => [
  ...(result.stdout
    ? [
        safeCommandArtifactFor({
          id: `${jobId}-stdout`,
          jobId,
          nodeId: result.nodeId,
          channel: "stdout",
          value: result.stdout,
          createdAt: result.completedAt,
        }),
      ]
    : []),
  ...(result.stderr
    ? [
        safeCommandArtifactFor({
          id: `${jobId}-stderr`,
          jobId,
          nodeId: result.nodeId,
          channel: "stderr",
          value: result.stderr,
          createdAt: result.completedAt,
        }),
      ]
    : []),
];

const safeCommandArtifactFor = (input: {
  id: string;
  jobId: string;
  nodeId: string;
  channel: "stdout" | "stderr";
  value: string;
  createdAt: string;
}): ComputeArtifactRecord => ({
  id: input.id,
  jobId: input.jobId,
  nodeId: input.nodeId,
  path: `compute/artifacts/${input.jobId}/${input.channel}.txt`,
  type: "log",
  sizeBytes: new TextEncoder().encode(input.value).length,
  sha256: sha256Hex(input.value),
  createdAt: input.createdAt,
  retention: "review",
  sensitivity: "internal",
});

const sha256Hex = (value: string): string => {
  const bytes = new TextEncoder().encode(value);
  const words = new Array<number>(64);
  const hash = [
    0x6a09e667,
    0xbb67ae85,
    0x3c6ef372,
    0xa54ff53a,
    0x510e527f,
    0x9b05688c,
    0x1f83d9ab,
    0x5be0cd19,
  ];
  const constants = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const paddedLength = (((bytes.length + 9 + 63) >> 6) << 6);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;
  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 4, bitLength, false);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4, false);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + constants[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((word) => word.toString(16).padStart(8, "0")).join("");
};

const rotateRight = (value: number, bits: number): number => (value >>> bits) | (value << (32 - bits));
