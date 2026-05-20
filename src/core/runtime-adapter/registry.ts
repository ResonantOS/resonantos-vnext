// ============================================================
// RuntimeAdapterRegistryImpl — Phase 9a
// ROS vNext · Runtime Adapter Layer
// Source: RUNTIME-ADAPTER-LAYER-SPEC.md §2 (RuntimeAdapterRegistry interface)
//
// Manages adapter registration, health-based routing, and lifecycle.
// The native adapter is always present as the permanent fallback.
// ============================================================

import {
  RuntimeAdapter,
  RuntimeAdapterRegistry,
  RuntimeId,
  CapabilityTier,
  HealthStatus,
  HealthState,
} from './types';

// ── Tier Ranking ─────────────────────────────────────────────

/**
 * Numeric rank for capability tiers.
 * Higher rank = broader access. An adapter at rank N can serve requests at rank ≤ N.
 */
const TIER_RANK: Record<CapabilityTier, number> = {
  'read-only':         0,
  'workspace':         1,
  'danger-no-sandbox': 2,
};

// ── RuntimeAdapterRegistryImpl ────────────────────────────────

export class RuntimeAdapterRegistryImpl implements RuntimeAdapterRegistry {
  /** Live adapter map: id → adapter instance. */
  private readonly adapters = new Map<RuntimeId, RuntimeAdapter>();

  /**
   * Cached health status per adapter.
   * Updated by refreshHealth() or explicit health probe calls.
   * Initialized to a placeholder 'healthy' on registration.
   */
  private readonly healthCache = new Map<RuntimeId, HealthStatus>();

  // ── Registration ──────────────────────────────────────────

  /**
   * Register an adapter. Throws if an adapter with the same id is already registered.
   * Initialises the health cache with a placeholder entry.
   */
  register(adapter: RuntimeAdapter): void {
    if (this.adapters.has(adapter.id)) {
      throw new Error(
        `RuntimeAdapterRegistry: adapter '${adapter.id}' is already registered. ` +
        `Deregister it before re-registering.`
      );
    }
    this.adapters.set(adapter.id, adapter);

    // Seed cache with a placeholder — health is genuinely unknown until
    // the first refreshHealth() call, but 'healthy' is a safe default
    // for the native adapter which is always in-process.
    this.healthCache.set(adapter.id, {
      state: 'healthy',
      adapterId: adapter.id,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      detail: 'Initial registration — health not yet probed.',
    });
  }

  /**
   * Deregister an adapter by id. Calls disconnect() first.
   * Cannot deregister 'native' — it is the permanent fallback.
   * Throws if the adapter is not registered or id === 'native'.
   */
  async deregister(id: RuntimeId): Promise<void> {
    if (id === 'native') {
      throw new Error(
        `RuntimeAdapterRegistry: cannot deregister the 'native' adapter. ` +
        `It is the permanent fallback and must always be present.`
      );
    }

    const adapter = this.adapters.get(id);
    if (adapter === undefined) {
      throw new Error(
        `RuntimeAdapterRegistry: adapter '${id}' is not registered.`
      );
    }

    // Disconnect before removing — spec says disconnect() must not throw,
    // but we guard anyway.
    try {
      await adapter.disconnect();
    } catch {
      // disconnect() swallows its own errors per spec; belt-and-suspenders guard.
    }

    this.adapters.delete(id);
    this.healthCache.delete(id);
  }

  // ── Routing ───────────────────────────────────────────────

  /**
   * Return the active adapter for a given capability tier.
   *
   * Selection logic:
   *  1. Iterate non-native adapters in registration order.
   *  2. Pick the first adapter whose tier rank ≥ requested tier rank
   *     AND whose cached health state is 'healthy' or 'degraded'.
   *  3. If none qualify, fall back to native (always healthy, in-process).
   *
   * Health data comes from the cache (sync path). Callers should call
   * refreshHealth() periodically to keep routing decisions accurate.
   */
  getAdapter(tier: CapabilityTier): RuntimeAdapter {
    const requestedRank = TIER_RANK[tier];

    for (const [id, adapter] of this.adapters) {
      if (id === 'native') continue; // reserve native as last resort

      const adapterRank = TIER_RANK[adapter.capabilities.tier];
      if (adapterRank < requestedRank) continue; // can't serve this tier

      const health = this.healthCache.get(id);
      const state: HealthState = health?.state ?? 'healthy';
      if (state === 'healthy' || state === 'degraded') {
        return adapter;
      }
    }

    // Native is the unconditional fallback.
    return this.getById('native');
  }

  /**
   * Return a specific adapter by id. Throws if not registered.
   */
  getById(id: RuntimeId): RuntimeAdapter {
    const adapter = this.adapters.get(id);
    if (adapter === undefined) {
      throw new Error(
        `RuntimeAdapterRegistry: adapter '${id}' is not registered.`
      );
    }
    return adapter;
  }

  /**
   * List all registered adapters with their cached health status.
   *
   * Returns synchronously from the health cache; does NOT probe adapters.
   * Call refreshHealth() first if fresh data is required.
   */
  listAdapters(): Array<{ adapter: RuntimeAdapter; health: HealthStatus }> {
    const now = new Date().toISOString();
    return Array.from(this.adapters.values()).map(adapter => ({
      adapter,
      health: this.healthCache.get(adapter.id) ?? {
        state: 'healthy' as HealthState,
        adapterId: adapter.id,
        checkedAt: now,
        latencyMs: 0,
        detail: 'Health cache empty — call refreshHealth() to populate.',
      },
    }));
  }

  // ── Health Management (beyond the interface) ───────────────

  /**
   * Probe all registered adapters and update the health cache.
   *
   * Not part of RuntimeAdapterRegistry interface — callers that need
   * accurate health-based routing should invoke this periodically
   * (e.g., every 30 seconds via heartbeat).
   */
  async refreshHealth(): Promise<void> {
    const probes = Array.from(this.adapters.values()).map(async adapter => {
      const probeStart = Date.now();
      try {
        const health = await adapter.healthCheck();
        this.healthCache.set(adapter.id, health);
      } catch (err) {
        this.healthCache.set(adapter.id, {
          state: 'unreachable',
          adapterId: adapter.id,
          checkedAt: new Date().toISOString(),
          latencyMs: Date.now() - probeStart,
          detail: err instanceof Error ? err.message : String(err),
        });
      }
    });

    await Promise.all(probes);
  }

  /**
   * Update the health cache for a single adapter (e.g., after a one-off probe).
   * Useful when the caller already has a fresh HealthStatus from another source.
   */
  updateHealth(health: HealthStatus): void {
    if (!this.adapters.has(health.adapterId)) {
      throw new Error(
        `RuntimeAdapterRegistry.updateHealth: adapter '${health.adapterId}' is not registered.`
      );
    }
    this.healthCache.set(health.adapterId, health);
  }

  /**
   * Return the number of registered adapters (including native).
   */
  get size(): number {
    return this.adapters.size;
  }

  /**
   * Return true if an adapter with the given id is registered.
   */
  has(id: RuntimeId): boolean {
    return this.adapters.has(id);
  }
}
