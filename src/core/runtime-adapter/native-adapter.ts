// ============================================================
// NativeRuntimeAdapter — Phase 9b
// ROS vNext · Runtime Adapter Layer
// Source: RUNTIME-ADAPTER-LAYER-SPEC.md §3
//
// Wraps OpenClaw's existing in-process tool executor.
// Always present. The permanent fallback for all other adapters.
// ============================================================

import {
  RuntimeAdapter,
  RuntimeCapabilities,
  RuntimeConfig,
  ToolCall,
  ToolResult,
  ToolDefinition,
  PluginInfo,
  HealthStatus,
  RuntimeEvent,
  RuntimeId,
  ToolError,
  ToolErrorClass,
} from './types';

// ── Internal: Timeout Error ──────────────────────────────────

/** Distinguishable timeout error for classifyError. */
class ExecTimeoutError extends Error {
  constructor() {
    super('EXEC_TIMEOUT');
    this.name = 'ExecTimeoutError';
  }
}

// ── NativeRuntimeAdapter ─────────────────────────────────────

export class NativeRuntimeAdapter implements RuntimeAdapter {
  readonly id: RuntimeId = 'native';

  readonly capabilities: RuntimeCapabilities = {
    tier: 'danger-no-sandbox',  // native executor has full access
    sandbox: false,
    fileAccess: true,
    networkAccess: true,
    shellAccess: true,
    mcpCallbackSupport: false,  // native doesn't need MCP — it IS the core
    maxConcurrency: 10,
  };

  readonly config: RuntimeConfig = {
    id: 'native',
    executionTimeoutMs: 30_000,
    lifecycleTimeoutMs: 5_000,
    maxRetries: 3,
    retryDelayMs: 500,
    exponentialBackoff: true,
    mcpServerUrl: null,
  };

  private eventHandlers: Array<(event: RuntimeEvent) => void> = [];
  private connected = false;

  // ── Lifecycle ─────────────────────────────────────────────

  async connect(): Promise<void> {
    // NativeRuntimeAdapter is always ready — OpenClaw tool executor
    // is in-process. Just mark connected.
    this.connected = true;
    this.emit({
      eventType: 'runtime_connected',
      adapterId: this.id,
      timestamp: new Date().toISOString(),
      payload: { message: 'Native adapter connected (in-process)' },
    });
  }

  async disconnect(): Promise<void> {
    // Swallow all errors per spec — must not throw.
    try {
      this.connected = false;
      this.emit({
        eventType: 'runtime_disconnected',
        adapterId: this.id,
        timestamp: new Date().toISOString(),
        payload: {},
      });
    } catch {
      // intentionally swallowed
    }
  }

  async healthCheck(): Promise<HealthStatus> {
    // Native is always healthy unless OpenClaw itself is broken.
    return {
      state: 'healthy',
      adapterId: this.id,
      checkedAt: new Date().toISOString(),
      latencyMs: 0,
    };
  }

  // ── Execution ─────────────────────────────────────────────

  async executeTool(call: ToolCall): Promise<ToolResult> {
    const started = Date.now();

    this.emit({
      eventType: 'tool_started',
      adapterId: this.id,
      timestamp: new Date().toISOString(),
      callId: call.callId,
      payload: { toolName: call.toolName, sessionId: call.sessionId },
    });

    let attempt = 0;
    const maxRetries = this.config.maxRetries;

    while (true) {
      try {
        // Race the dispatch against the execution timeout.
        const output = await this.executeWithTimeout(call);

        const completedAt = new Date().toISOString();
        const result: ToolResult = {
          callId: call.callId,
          toolName: call.toolName,
          status: 'success',
          output,
          durationMs: Date.now() - started,
          completedAt,
          adapterId: this.id,
        };

        this.emit({
          eventType: 'tool_completed',
          adapterId: this.id,
          timestamp: completedAt,
          callId: call.callId,
          payload: { durationMs: result.durationMs },
        });

        return result;

      } catch (err: unknown) {
        const toolError = this.classifyError(err, attempt);
        const isTimeout = err instanceof ExecTimeoutError;

        const shouldNotRetry =
          toolError.errorClass === 'PERMANENT' ||
          toolError.errorClass === 'SECURITY' ||
          toolError.errorClass === 'RUNTIME_DOWN' ||
          attempt >= maxRetries;

        if (shouldNotRetry) {
          const completedAt = new Date().toISOString();
          const status: ToolResult['status'] =
            isTimeout           ? 'timeout' :
            toolError.errorClass === 'SECURITY' ? 'denied'  :
            'error';

          const result: ToolResult = {
            callId: call.callId,
            toolName: call.toolName,
            status,
            error: toolError,
            durationMs: Date.now() - started,
            completedAt,
            adapterId: this.id,
          };

          this.emit({
            eventType: isTimeout ? 'tool_timed_out' : 'tool_failed',
            adapterId: this.id,
            timestamp: completedAt,
            callId: call.callId,
            payload: { error: toolError, durationMs: result.durationMs },
          });

          return result;
        }

        // TRANSIENT — backoff and retry
        const delay = this.config.retryDelayMs * Math.pow(2, attempt);
        await this.sleep(delay);
        attempt++;
      }
    }
  }

  // ── Discovery ─────────────────────────────────────────────

  async listAvailableTools(): Promise<ToolDefinition[]> {
    // Return all tools registered in OpenClaw's tool registry.
    // Implementation: enumerate the tool manifest from OpenClaw internals.
    // Stub returns empty until OpenClaw internal API is exposed.
    return [];
  }

  async listInstalledPlugins(): Promise<PluginInfo[]> {
    // Read from openclaw.json plugins.entries.
    // Each entry with enabled=true is a registered plugin.
    // Stub returns empty until integration is wired.
    return [];
  }

  // ── Events ────────────────────────────────────────────────

  onEvent(handler: (event: RuntimeEvent) => void): void {
    this.eventHandlers.push(handler);
  }

  offEvent(handler: (event: RuntimeEvent) => void): void {
    this.eventHandlers = this.eventHandlers.filter(h => h !== handler);
  }

  // ── Private ───────────────────────────────────────────────

  /**
   * Race the tool dispatch against config.executionTimeoutMs.
   * Throws ExecTimeoutError if the timeout fires first.
   */
  private executeWithTimeout(call: ToolCall): Promise<unknown> {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new ExecTimeoutError());
      }, this.config.executionTimeoutMs);

      this.dispatchToOpenClaw(call).then(
        (result) => {
          clearTimeout(timer);
          resolve(result);
        },
        (err: unknown) => {
          clearTimeout(timer);
          reject(err);
        }
      );
    });
  }

  /**
   * Seam point: call OpenClaw's internal tool dispatcher.
   * This function signature matches how OpenClaw's tool executor
   * is invoked internally. Replace the body with the actual import
   * when integrating into the OpenClaw source tree.
   *
   * If running as a plugin (outside OpenClaw source), this can be
   * replaced with a local IPC call to the gateway's tool endpoint.
   */
  private async dispatchToOpenClaw(_call: ToolCall): Promise<unknown> {
    // TODO (Phase 9b integration): import from OpenClaw internals:
    //   import { executeToolCall } from '../../core/tool-executor';
    //   return executeToolCall(call.toolName, call.params, call.sessionId);
    //
    // For now, throw to surface the seam point during testing.
    throw new Error(
      `NativeRuntimeAdapter.dispatchToOpenClaw not yet wired. ` +
      `This is the Phase 9b integration seam.`
    );
  }

  /**
   * Classify a caught exception into a ToolError.
   * Maps exception messages to ToolErrorClass for retry/routing decisions.
   */
  private classifyError(err: unknown, attempt: number): ToolError {
    const message = err instanceof Error ? err.message : String(err);

    // TRANSIENT: Execution timeout.
    if (err instanceof ExecTimeoutError) {
      return {
        code: 'EXEC_TIMEOUT',
        message,
        errorClass: 'TRANSIENT' as ToolErrorClass,
        cause: err,
        attempt,
      };
    }

    // SECURITY: Shield or Logician blocked this call.
    if (
      message.includes('SHIELD_DENIED') ||
      message.includes('LOGICIAN_DENY')
    ) {
      return {
        code: 'SECURITY_DENIED',
        message,
        errorClass: 'SECURITY' as ToolErrorClass,
        cause: err,
        attempt,
      };
    }

    // PERMANENT: Tool doesn't exist or schema mismatch.
    if (
      message.includes('unknown tool') ||
      message.includes('schema validation failed')
    ) {
      return {
        code: 'TOOL_NOT_FOUND',
        message,
        errorClass: 'PERMANENT' as ToolErrorClass,
        cause: err,
        attempt,
      };
    }

    // TRANSIENT: Network, process crash, or unknown error.
    return {
      code: 'EXEC_ERROR',
      message,
      errorClass: 'TRANSIENT' as ToolErrorClass,
      cause: err,
      attempt,
    };
  }

  /**
   * Fire an event to all registered handlers.
   * Fire-and-forget: event delivery must not block execution.
   */
  private emit(event: RuntimeEvent): void {
    for (const handler of this.eventHandlers) {
      // Fire-and-forget via microtask — avoids blocking the execution path.
      // Using Promise.resolve() instead of setImmediate for portability
      // (no @types/node dependency required at compile time).
      Promise.resolve().then(() => handler(event)).catch(() => { /* swallow */ });
    }
  }

  /** Returns a Promise that resolves after `ms` milliseconds. */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /** Whether this adapter is currently connected. */
  get isConnected(): boolean {
    return this.connected;
  }
}
