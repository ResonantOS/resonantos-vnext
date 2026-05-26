import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { once } from "node:events";
import { resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { AddOnManifest, ResonantShellState } from "./contracts";
import { buildDefaultState } from "./defaults";
import { resolveMemoryProviderBroker } from "./memory-provider";

const port = 4899;

const referenceMemoryManifest = (): AddOnManifest => ({
  id: "addon.reference-memory",
  name: "Reference Memory",
  version: "0.1.0",
  author: "Resonant Alpha",
  category: "memory",
  sdkVersion: "0.1.0",
  description: "Reference memory provider test manifest.",
  runtimeType: "local-service",
  surfaces: [],
  requestedCapabilities: [
    { capability: "memory-provider", granted: false, scope: "system", revocationBehavior: "hard-stop" },
    { capability: "network", granted: false, scope: "self", revocationBehavior: "hard-stop" },
  ],
  providerRequirements: {
    sharedProfiles: [],
    supportsPrivateCredentials: false,
  },
  systemSlots: [
    {
      id: "memory-system",
      role: "alternative-provider",
      replaceable: true,
      recommended: false,
    },
  ],
  archiveIntegration: {
    readScopes: [],
    intakeWriteScopes: [],
    canRequestIngest: true,
    canWriteKnowledgePages: false,
  },
  health: {
    strategy: "http-json-memory-status",
  },
  service: {
    protocol: "http-json",
    entrypoint: `http://127.0.0.1:${port}`,
    healthCommand: "memory.status",
  },
  installHooks: {},
  compatibility: {
    shellVersion: "^0.1.0",
    platforms: ["macOS", "linux", "windows"],
  },
});

const enableProvider = (state: ResonantShellState, manifest: AddOnManifest): ResonantShellState => ({
  ...state,
  installations: {
    ...state.installations,
    [manifest.id]: {
      ...state.installations[manifest.id],
      installed: true,
      enabled: true,
      status: "enabled",
      grantedCapabilities: state.installations[manifest.id].grantedCapabilities.map((grant) => ({ ...grant, granted: true })),
    },
  },
});

const waitForServer = async (service: ChildProcessWithoutNullStreams): Promise<void> => {
  const deadline = Date.now() + 5_000;
  let output = "";
  service.stdout.on("data", (chunk) => {
    output += String(chunk);
  });
  while (!output.includes("Reference Memory service listening")) {
    if (Date.now() > deadline) {
      throw new Error(`Reference Memory service did not start. Output: ${output}`);
    }
    if (service.exitCode !== null) {
      throw new Error(`Reference Memory service exited before ready. Output: ${output}`);
    }
    await new Promise((resolveReady) => setTimeout(resolveReady, 25));
  }
};

describe("reference memory provider", () => {
  let service: ChildProcessWithoutNullStreams | null = null;

  afterEach(async () => {
    if (!service || service.exitCode !== null) {
      service = null;
      return;
    }
    service.kill();
    await once(service, "exit");
    service = null;
  });

  it("proves a non-Living Archive memory provider can satisfy the broker contract", async () => {
    service = spawn(process.execPath, [resolve(process.cwd(), "examples", "reference-memory-service.mjs")], {
      env: { ...process.env, REFERENCE_MEMORY_PORT: String(port) },
    });
    await waitForServer(service);

    const manifest = referenceMemoryManifest();
    const state = enableProvider(buildDefaultState([manifest]), manifest);
    const broker = resolveMemoryProviderBroker(state, [manifest]);

    const status = await broker.status();
    const search = await broker.search("memory", 5);
    const document = await broker.read("reference://memory/index");
    const intake = await broker.intakeWrite({
      actorId: "test.actor",
      bucket: "broker-test",
      fileName: "artifact.md",
      content: "# Broker Test",
    });

    expect(broker.kind).toBe("http-json");
    expect(status.status).toBe("ready");
    expect(search.pages[0]?.title).toBe("Reference Memory Index");
    expect(document.content).toContain("non-Living Archive provider");
    expect(intake.artifactPath).toBe("reference://intake/broker-test/artifact.md");
  });
});
