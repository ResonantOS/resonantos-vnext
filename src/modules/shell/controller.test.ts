// Intent citation: docs/architecture/ADR-002-modular-codebase.md

import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildDefaultState } from "../../core/defaults";

const runtimeMocks = vi.hoisted(() => ({
  applyProviderCredentialStatuses: vi.fn((state) => state),
  hydrateState: vi.fn(),
  loadBundledManifests: vi.fn(),
  loadProviderCredentialStatuses: vi.fn(),
  loadSideloadedManifests: vi.fn(),
  requestLocalRuntimeStatus: vi.fn(),
  requestRecoveryRouteCandidates: vi.fn(),
}));

vi.mock("../../core/runtime", () => runtimeMocks);

describe("shell boot controller", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    runtimeMocks.loadBundledManifests.mockResolvedValue([]);
    runtimeMocks.loadSideloadedManifests.mockResolvedValue([]);
    runtimeMocks.loadProviderCredentialStatuses.mockResolvedValue([]);
  });

  it("preserves the persisted active workspace instead of forcing Home on boot", async () => {
    const state = buildDefaultState([]);
    state.uiPreferences.activeSection = "archive";
    runtimeMocks.hydrateState.mockResolvedValue(state);

    const { loadInitialShellState } = await import("./controller");
    const booted = await loadInitialShellState();

    expect(booted.state.uiPreferences.activeSection).toBe("archive");
  });
});
