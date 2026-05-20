// ============================================================
// Runtime Adapter Layer — Test Suite
// ROS vNext · Phase 9a+9b
//
// Covers NativeRuntimeAdapter + RuntimeAdapterRegistryImpl
// Uses real timers with fast configs to avoid fake-timer deadlocks.
// ============================================================

import { describe, it, expect, beforeEach } from 'vitest';
import { NativeRuntimeAdapter } from './native-adapter';
import { RuntimeAdapterRegistryImpl } from './registry';
import type {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeConfig,
  ToolCall,
  HealthStatus,
  RuntimeEvent,
  CapabilityTier,
  RuntimeId,
  ToolDefinition,
  PluginInfo,
} from './types';

// ── Helpers ──────────────────────────────────────────────────

function makeToolCall(overrides: Partial<ToolCall> = {}): ToolCall {
  return {
    callId: 'call-001',
    toolName: 'exec',
    params: { command: 'echo hello' },
    sessionId: 'session-abc',
    initiatedAt: new Date().toISOString(),
    requiredTier: 'workspace',
    ...overrides,
  };
}

async function flushMicrotasks(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 5));
}

/**
 * Create a NativeRuntimeAdapter with very fast timeouts for testing.
 * executionTimeoutMs=50, retryDelayMs=5, maxRetries=2
 */
function makeFastAdapter(): NativeRuntimeAdapter {
  const adapter = new NativeRuntimeAdapter();
  // Override config for fast tests (config is readonly but we cast for testing)
  const mutableConfig = adapter.config as { -readonly [K in keyof RuntimeConfig]: RuntimeConfig[K] };
  mutableConfig.executionTimeoutMs = 50;
  mutableConfig.retryDelayMs = 5;
  mutableConfig.maxRetries = 2;
  return adapter;
}

/** Fake adapter for registry routing tests. */
function makeFakeAdapter(
  id: RuntimeId,
  tier: CapabilityTier,
  healthState: HealthStatus['state'] = 'healthy'
): RuntimeAdapter {
  const healthStatus: HealthStatus = {
    state: healthState,
    adapterId: id,
    checkedAt: new Date().toISOString(),
    latencyMs: 1,
  };

  return {
    id,
    capabilities: {
      tier,
      sandbox: true,
      fileAccess: false,
      networkAccess: false,
      shellAccess: false,
      mcpCallbackSupport: true,
      maxConcurrency: 4,
    } satisfies RuntimeCapabilities,
    config: {
      id,
      executionTimeoutMs: 5_000,
      lifecycleTimeoutMs: 2_000,
      maxRetries: 1,
      retryDelayMs: 50,
      exponentialBackoff: true,
      mcpServerUrl: null,
    } satisfies RuntimeConfig,
    connect: async () => {},
    disconnect: async () => {},
    healthCheck: async () => healthStatus,
    executeTool: async (call: ToolCall) => ({
      callId: call.callId,
      toolName: call.toolName,
      status: 'success' as const,
      output: { from: id },
      durationMs: 1,
      completedAt: new Date().toISOString(),
      adapterId: id,
    }),
    listAvailableTools: async () => [] as ToolDefinition[],
    listInstalledPlugins: async () => [] as PluginInfo[],
    onEvent: () => {},
    offEvent: () => {},
  };
}

// =============================================================
// NativeRuntimeAdapter Tests
// =============================================================

describe('NativeRuntimeAdapter', () => {
  let adapter: NativeRuntimeAdapter;

  beforeEach(() => {
    adapter = makeFastAdapter();
  });

  // ── Identity & Capabilities ─────────────────────────────

  it('has id "native"', () => {
    expect(adapter.id).toBe('native');
  });

  it('declares danger-no-sandbox tier', () => {
    expect(adapter.capabilities.tier).toBe('danger-no-sandbox');
  });

  it('has full access capabilities', () => {
    expect(adapter.capabilities.fileAccess).toBe(true);
    expect(adapter.capabilities.networkAccess).toBe(true);
    expect(adapter.capabilities.shellAccess).toBe(true);
    expect(adapter.capabilities.sandbox).toBe(false);
  });

  it('does not support MCP callbacks (it IS the core)', () => {
    expect(adapter.capabilities.mcpCallbackSupport).toBe(false);
  });

  it('has maxConcurrency of 10', () => {
    expect(adapter.capabilities.maxConcurrency).toBe(10);
  });

  // ── Lifecycle ───────────────────────────────────────────

  it('connect sets connected state', async () => {
    expect(adapter.isConnected).toBe(false);
    await adapter.connect();
    expect(adapter.isConnected).toBe(true);
  });

  it('disconnect clears connected state', async () => {
    await adapter.connect();
    expect(adapter.isConnected).toBe(true);
    await adapter.disconnect();
    expect(adapter.isConnected).toBe(false);
  });

  it('disconnect does not throw', async () => {
    // Even without connect(), disconnect should be safe
    await expect(adapter.disconnect()).resolves.toBeUndefined();
  });

  // ── Health ──────────────────────────────────────────────

  it('healthCheck always returns healthy', async () => {
    const health = await adapter.healthCheck();
    expect(health.state).toBe('healthy');
    expect(health.adapterId).toBe('native');
    expect(health.latencyMs).toBe(0);
    expect(health.checkedAt).toBeTruthy();
  });

  // ── Tool Execution ─────────────────────────────────────

  it('executeTool returns error for unwired seam', async () => {
    const call = makeToolCall();
    const result = await adapter.executeTool(call);
    // dispatchToOpenClaw throws "not yet wired" — classified as TRANSIENT,
    // retried maxRetries times, then returns error
    expect(result.callId).toBe('call-001');
    expect(result.toolName).toBe('exec');
    expect(result.status).toBe('error');
    expect(result.error).toBeDefined();
    expect(result.error!.message).toContain('not yet wired');
    expect(result.adapterId).toBe('native');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.completedAt).toBeTruthy();
  });

  it('executeTool propagates callId verbatim', async () => {
    const call = makeToolCall({ callId: 'unique-correlation-id-42' });
    const result = await adapter.executeTool(call);
    expect(result.callId).toBe('unique-correlation-id-42');
  });

  // ── Error Classification ───────────────────────────────

  it('classifies SHIELD_DENIED as SECURITY error', async () => {
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      throw new Error('SHIELD_DENIED: read-only tier violation');
    };

    const result = await adapter.executeTool(makeToolCall());
    expect(result.status).toBe('denied');
    expect(result.error!.errorClass).toBe('SECURITY');
  });

  it('classifies LOGICIAN_DENY as SECURITY error', async () => {
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      throw new Error('LOGICIAN_DENY: policy violation');
    };

    const result = await adapter.executeTool(makeToolCall());
    expect(result.status).toBe('denied');
    expect(result.error!.errorClass).toBe('SECURITY');
  });

  it('classifies unknown tool as PERMANENT error', async () => {
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      throw new Error('unknown tool: nonexistent_tool');
    };

    const result = await adapter.executeTool(makeToolCall());
    expect(result.status).toBe('error');
    expect(result.error!.errorClass).toBe('PERMANENT');
  });

  it('classifies schema validation failure as PERMANENT error', async () => {
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      throw new Error('schema validation failed for param "count"');
    };

    const result = await adapter.executeTool(makeToolCall());
    expect(result.status).toBe('error');
    expect(result.error!.errorClass).toBe('PERMANENT');
  });

  it('does NOT retry SECURITY errors', async () => {
    let callCount = 0;
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      callCount++;
      throw new Error('SHIELD_DENIED');
    };

    await adapter.executeTool(makeToolCall());
    expect(callCount).toBe(1); // No retries
  });

  it('does NOT retry PERMANENT errors', async () => {
    let callCount = 0;
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      callCount++;
      throw new Error('unknown tool: nope');
    };

    await adapter.executeTool(makeToolCall());
    expect(callCount).toBe(1); // No retries
  });

  it('retries TRANSIENT errors up to maxRetries', async () => {
    let callCount = 0;
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      callCount++;
      throw new Error('network glitch');
    };

    await adapter.executeTool(makeToolCall());
    // 1 initial + 2 retries = 3 total (maxRetries=2)
    expect(callCount).toBe(3);
  });

  it('succeeds on retry after transient failure', async () => {
    let callCount = 0;
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = async () => {
      callCount++;
      if (callCount < 2) throw new Error('transient glitch');
      return { ok: true };
    };

    const result = await adapter.executeTool(makeToolCall());
    expect(result.status).toBe('success');
    expect(result.output).toEqual({ ok: true });
    expect(callCount).toBe(2);
  });

  // ── Timeout ─────────────────────────────────────────────

  it('returns timeout when execution exceeds limit', async () => {
    const privateAdapter = adapter as unknown as {
      dispatchToOpenClaw: (call: ToolCall) => Promise<unknown>;
    };
    privateAdapter.dispatchToOpenClaw = () =>
      new Promise(() => {}); // Never resolves

    // maxRetries=2, executionTimeoutMs=50 → should finish in <200ms
    const result = await adapter.executeTool(makeToolCall({ callId: 'timeout-test' }));
    expect(result.status).toBe('timeout');
    expect(result.error!.code).toBe('EXEC_TIMEOUT');
    expect(result.error!.errorClass).toBe('TRANSIENT');
  }, 5000);

  // ── Events ──────────────────────────────────────────────

  it('emits runtime_connected on connect', async () => {
    const events: RuntimeEvent[] = [];
    adapter.onEvent(e => events.push(e));

    await adapter.connect();
    await flushMicrotasks();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.eventType).toBe('runtime_connected');
    expect(events[0]!.adapterId).toBe('native');
  });

  it('emits runtime_disconnected on disconnect', async () => {
    const events: RuntimeEvent[] = [];
    adapter.onEvent(e => events.push(e));

    await adapter.connect();
    await flushMicrotasks();
    events.length = 0; // clear connect event

    await adapter.disconnect();
    await flushMicrotasks();

    expect(events.length).toBeGreaterThanOrEqual(1);
    expect(events[0]!.eventType).toBe('runtime_disconnected');
  });

  it('emits tool_started on executeTool', async () => {
    const events: RuntimeEvent[] = [];
    adapter.onEvent(e => events.push(e));

    await adapter.executeTool(makeToolCall({ callId: 'evt-test' }));
    await flushMicrotasks();

    const started = events.find(e => e.eventType === 'tool_started');
    expect(started).toBeDefined();
    expect(started!.callId).toBe('evt-test');
  });

  it('offEvent removes handler', async () => {
    const events: RuntimeEvent[] = [];
    const handler = (e: RuntimeEvent) => events.push(e);

    adapter.onEvent(handler);
    adapter.offEvent(handler);

    await adapter.connect();
    await flushMicrotasks();

    expect(events.length).toBe(0);
  });

  // ── Discovery (stubs) ──────────────────────────────────

  it('listAvailableTools returns empty array', async () => {
    expect(await adapter.listAvailableTools()).toEqual([]);
  });

  it('listInstalledPlugins returns empty array', async () => {
    expect(await adapter.listInstalledPlugins()).toEqual([]);
  });
});

// =============================================================
// RuntimeAdapterRegistryImpl Tests
// =============================================================

describe('RuntimeAdapterRegistryImpl', () => {
  let registry: RuntimeAdapterRegistryImpl;
  let nativeAdapter: NativeRuntimeAdapter;

  beforeEach(() => {
    registry = new RuntimeAdapterRegistryImpl();
    nativeAdapter = new NativeRuntimeAdapter();
    registry.register(nativeAdapter);
  });

  // ── Registration ────────────────────────────────────────

  it('registers native adapter', () => {
    expect(registry.has('native')).toBe(true);
    expect(registry.size).toBe(1);
  });

  it('throws on duplicate registration', () => {
    expect(() => registry.register(nativeAdapter)).toThrow('already registered');
  });

  it('registers additional adapters', () => {
    registry.register(makeFakeAdapter('codex', 'workspace'));
    expect(registry.size).toBe(2);
    expect(registry.has('codex')).toBe(true);
  });

  // ── Deregistration ──────────────────────────────────────

  it('cannot deregister native adapter', async () => {
    await expect(registry.deregister('native')).rejects.toThrow('cannot deregister');
  });

  it('deregisters non-native adapter', async () => {
    const fake = makeFakeAdapter('codex', 'workspace');
    registry.register(fake);
    expect(registry.size).toBe(2);

    await registry.deregister('codex');
    expect(registry.size).toBe(1);
    expect(registry.has('codex')).toBe(false);
  });

  it('throws when deregistering unregistered adapter', async () => {
    await expect(registry.deregister('nonexistent')).rejects.toThrow('not registered');
  });

  // ── getById ─────────────────────────────────────────────

  it('getById returns registered adapter', () => {
    const adapter = registry.getById('native');
    expect(adapter.id).toBe('native');
  });

  it('getById throws for unregistered id', () => {
    expect(() => registry.getById('nonexistent')).toThrow('not registered');
  });

  // ── Tier-based routing ──────────────────────────────────

  it('falls back to native when no other adapters registered', () => {
    const adapter = registry.getAdapter('workspace');
    expect(adapter.id).toBe('native');
  });

  it('routes to non-native adapter when healthy and tier matches', () => {
    registry.register(makeFakeAdapter('codex', 'workspace'));
    const adapter = registry.getAdapter('workspace');
    expect(adapter.id).toBe('codex');
  });

  it('falls back to native when non-native adapter is unhealthy', () => {
    registry.register(makeFakeAdapter('codex', 'workspace', 'unhealthy'));
    // Manually update health cache to unhealthy
    registry.updateHealth({
      state: 'unhealthy',
      adapterId: 'codex',
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
      detail: 'test: forced unhealthy',
    });

    const adapter = registry.getAdapter('workspace');
    expect(adapter.id).toBe('native');
  });

  it('routes to degraded adapter (still usable)', () => {
    const fake = makeFakeAdapter('codex', 'workspace', 'degraded');
    registry.register(fake);
    registry.updateHealth({
      state: 'degraded',
      adapterId: 'codex',
      checkedAt: new Date().toISOString(),
      latencyMs: 50,
      detail: 'test: degraded but functional',
    });

    const adapter = registry.getAdapter('workspace');
    expect(adapter.id).toBe('codex');
  });

  it('skips adapter with insufficient tier', () => {
    // Register a read-only adapter
    registry.register(makeFakeAdapter('reader', 'read-only'));

    // Request workspace tier — reader can't serve it
    const adapter = registry.getAdapter('workspace');
    expect(adapter.id).toBe('native'); // falls back
  });

  it('higher-tier adapter can serve lower-tier requests', () => {
    registry.register(makeFakeAdapter('codex', 'danger-no-sandbox'));

    // Request read-only — codex at danger-no-sandbox can serve it
    const adapter = registry.getAdapter('read-only');
    expect(adapter.id).toBe('codex');
  });

  // ── listAdapters ────────────────────────────────────────

  it('listAdapters returns all registered with health', () => {
    registry.register(makeFakeAdapter('codex', 'workspace'));
    const list = registry.listAdapters();

    expect(list.length).toBe(2);
    expect(list.map(item => item.adapter.id).sort()).toEqual(['codex', 'native']);
    expect(list.every(item => item.health.state === 'healthy')).toBe(true);
  });

  // ── refreshHealth ───────────────────────────────────────

  it('refreshHealth updates cache from adapter probes', async () => {
    const fake = makeFakeAdapter('codex', 'workspace');
    registry.register(fake);

    await registry.refreshHealth();

    const list = registry.listAdapters();
    const codexEntry = list.find(item => item.adapter.id === 'codex');
    expect(codexEntry).toBeDefined();
    expect(codexEntry!.health.state).toBe('healthy');
    expect(codexEntry!.health.latencyMs).toBe(1);
  });

  it('refreshHealth marks unreachable adapter when healthCheck throws', async () => {
    const fake = makeFakeAdapter('broken', 'workspace');
    fake.healthCheck = async () => { throw new Error('connection refused'); };
    registry.register(fake);

    await registry.refreshHealth();

    const list = registry.listAdapters();
    const brokenEntry = list.find(item => item.adapter.id === 'broken');
    expect(brokenEntry).toBeDefined();
    expect(brokenEntry!.health.state).toBe('unreachable');
    expect(brokenEntry!.health.detail).toContain('connection refused');
  });

  // ── updateHealth ────────────────────────────────────────

  it('updateHealth updates cache for registered adapter', () => {
    registry.register(makeFakeAdapter('codex', 'workspace'));

    registry.updateHealth({
      state: 'degraded',
      adapterId: 'codex',
      checkedAt: new Date().toISOString(),
      latencyMs: 500,
      detail: 'high latency',
    });

    const list = registry.listAdapters();
    const codex = list.find(item => item.adapter.id === 'codex');
    expect(codex!.health.state).toBe('degraded');
    expect(codex!.health.detail).toBe('high latency');
  });

  it('updateHealth throws for unregistered adapter', () => {
    expect(() =>
      registry.updateHealth({
        state: 'healthy',
        adapterId: 'ghost',
        checkedAt: new Date().toISOString(),
        latencyMs: 0,
      })
    ).toThrow('not registered');
  });

  // ── size / has ──────────────────────────────────────────

  it('size reflects registration count', () => {
    expect(registry.size).toBe(1);
    registry.register(makeFakeAdapter('a', 'read-only'));
    registry.register(makeFakeAdapter('b', 'workspace'));
    expect(registry.size).toBe(3);
  });

  it('has returns false for unregistered id', () => {
    expect(registry.has('nonexistent')).toBe(false);
  });
});
