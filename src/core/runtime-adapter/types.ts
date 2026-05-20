// ============================================================
// Runtime Adapter Layer — Type Definitions
// ROS vNext · Section 8 Expansion · Phase 9a
// Source: RUNTIME-ADAPTER-LAYER-SPEC.md §2
// ============================================================

// ============================================================
// Core Types
// ============================================================

/** Unique runtime identifier. Lowercase, hyphenated. */
export type RuntimeId = 'native' | 'codex' | 'claude-code' | string;

/** Capability tiers — maps to Shield Gate classification. See §6. */
export type CapabilityTier = 'read-only' | 'workspace' | 'danger-no-sandbox';

/** Health states. */
export type HealthState = 'healthy' | 'degraded' | 'unhealthy' | 'unreachable';

// ============================================================
// Capability & Configuration
// ============================================================

export interface RuntimeCapabilities {
  tier: CapabilityTier;
  sandbox: boolean;
  fileAccess: boolean;
  networkAccess: boolean;
  shellAccess: boolean;
  /** Whether the runtime can host an MCP server for ROS callbacks. */
  mcpCallbackSupport: boolean;
  /** Max concurrent tool executions this runtime supports. */
  maxConcurrency: number;
}

export interface RuntimeConfig {
  id: RuntimeId;
  /** Timeout for a single tool execution in milliseconds. Default: 30_000. */
  executionTimeoutMs: number;
  /** Timeout for connect()/disconnect() in milliseconds. Default: 10_000. */
  lifecycleTimeoutMs: number;
  /** Max retry attempts on transient failure (TRANSIENT class only). Default: 3. */
  maxRetries: number;
  /** Delay between retries in milliseconds. Default: 500. Doubles each retry. */
  retryDelayMs: number;
  /** If true, retry with exponential backoff. Default: true. */
  exponentialBackoff: boolean;
  /** MCP server URL for ROS callbacks. Null if not supported. */
  mcpServerUrl: string | null;
}

// ============================================================
// Tool Call / Result
// ============================================================

export interface ToolCall {
  /** Correlation ID. Must be propagated to ToolResult. */
  callId: string;
  /** Tool name exactly as registered. */
  toolName: string;
  /** Tool input parameters. Must be JSON-serializable. */
  params: Record<string, unknown>;
  /** Session ID for correlation. */
  sessionId: string;
  /** ISO-8601 timestamp when the call was initiated. */
  initiatedAt: string;
  /** Shield-assigned capability tier for this call. */
  requiredTier: CapabilityTier;
}

export interface ToolResult {
  callId: string;
  toolName: string;
  /** 'success' | 'error' | 'timeout' | 'denied' */
  status: 'success' | 'error' | 'timeout' | 'denied';
  /** Result payload on success. */
  output?: unknown;
  /** Error detail on failure. */
  error?: ToolError;
  /** Wall-clock execution time in milliseconds. */
  durationMs: number;
  /** ISO-8601 timestamp when execution completed. */
  completedAt: string;
  /** Which adapter handled this call. */
  adapterId: RuntimeId;
}

// ============================================================
// Error Hierarchy
// ============================================================

export type ToolErrorClass =
  | 'TRANSIENT'      // retry eligible: network glitch, timeout, process crash
  | 'PERMANENT'      // do not retry: bad params, tool not found, schema mismatch
  | 'SECURITY'       // blocked by Shield or permission check
  | 'RUNTIME_DOWN';  // adapter is unhealthy — escalate to NativeRuntimeAdapter

export interface ToolError {
  code: string;        // e.g. "EXEC_TIMEOUT", "TOOL_NOT_FOUND", "SHIELD_DENIED"
  message: string;
  errorClass: ToolErrorClass;
  /** Original error from the external runtime, if available. */
  cause?: unknown;
  /** Retry attempt number when this error was thrown. 0 = first attempt. */
  attempt: number;
}

// ============================================================
// Tool & Plugin Discovery
// ============================================================

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema for input validation. */
  inputSchema: Record<string, unknown>;
  /** Minimum capability tier required. */
  requiredTier: CapabilityTier;
  /** Whether this tool is provided by the external runtime or ROS core. */
  source: 'runtime' | 'ros-core';
}

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  /** Tools exposed by this plugin. */
  tools: ToolDefinition[];
  /** Whether this plugin has been auto-migrated into ROS tool registry. */
  migrated: boolean;
}

// ============================================================
// Health
// ============================================================

export interface HealthStatus {
  state: HealthState;
  adapterId: RuntimeId;
  /** ISO-8601 timestamp of this check. */
  checkedAt: string;
  /** Latency of health probe in milliseconds. */
  latencyMs: number;
  /** Human-readable detail. Required when state != 'healthy'. */
  detail?: string;
  /** For 'degraded': which capabilities are impaired. */
  impairedCapabilities?: (keyof RuntimeCapabilities)[];
}

// ============================================================
// Events
// ============================================================

export type RuntimeEventType =
  | 'tool_started'
  | 'tool_completed'
  | 'tool_failed'
  | 'tool_timed_out'
  | 'runtime_connected'
  | 'runtime_disconnected'
  | 'runtime_health_changed'
  | 'plugin_discovered'
  | 'plugin_migrated'
  | 'mcp_callback_received';

export interface RuntimeEvent {
  eventType: RuntimeEventType;
  adapterId: RuntimeId;
  /** ISO-8601 timestamp. */
  timestamp: string;
  /** callId when eventType is tool_* */
  callId?: string;
  /** Full payload — depends on eventType. See §5 for projection rules. */
  payload: Record<string, unknown>;
}

// ============================================================
// The Interface
// ============================================================

export interface RuntimeAdapter {
  readonly id: RuntimeId;
  readonly capabilities: RuntimeCapabilities;
  readonly config: RuntimeConfig;

  // ── Lifecycle ───────────────────────────────────────────

  /**
   * Establish connection to the external runtime.
   * Must complete within config.lifecycleTimeoutMs.
   * Throws if connection fails — caller handles retry/fallback.
   */
  connect(): Promise<void>;

  /**
   * Graceful shutdown. Drain in-flight calls (max 5s), then disconnect.
   * Must not throw — swallow errors and log them.
   */
  disconnect(): Promise<void>;

  /**
   * Lightweight liveness check. Must return within 2000ms.
   * Used by RuntimeAdapterRegistry for health monitoring.
   */
  healthCheck(): Promise<HealthStatus>;

  // ── Execution ───────────────────────────────────────────

  /**
   * Execute a tool call via this runtime.
   *
   * Contract:
   *  - Respects config.executionTimeoutMs. If exceeded: return ToolResult
   *    with status='timeout' and error.errorClass='TRANSIENT'.
   *  - TRANSIENT errors are retried up to config.maxRetries times with
   *    exponential backoff (config.retryDelayMs, doubling each attempt).
   *  - PERMANENT and SECURITY errors are NOT retried.
   *  - RUNTIME_DOWN errors trigger failover to NativeRuntimeAdapter.
   *  - callId must be propagated to the returned ToolResult verbatim.
   *  - Always returns (never throws). Catch all internal exceptions and
   *    convert to ToolResult.error.
   */
  executeTool(call: ToolCall): Promise<ToolResult>;

  // ── Discovery ───────────────────────────────────────────

  /**
   * List all tools available on this runtime.
   * Returns empty array if runtime doesn't support discovery.
   * Must not throw.
   */
  listAvailableTools(): Promise<ToolDefinition[]>;

  /**
   * List all plugins installed on this runtime.
   * Returns empty array if runtime doesn't support plugin listing.
   * Must not throw.
   */
  listInstalledPlugins(): Promise<PluginInfo[]>;

  // ── Events ──────────────────────────────────────────────

  /**
   * Register a handler for all runtime events.
   * Handler is called asynchronously (fire-and-forget from adapter's perspective).
   * Multiple handlers may be registered; all are called.
   * The Event Projection Pipeline (§5) consumes these.
   */
  onEvent(handler: (event: RuntimeEvent) => void): void;

  /**
   * Remove a previously registered handler.
   */
  offEvent(handler: (event: RuntimeEvent) => void): void;
}

// ============================================================
// Registry Interface
// ============================================================

export interface RuntimeAdapterRegistry {
  /**
   * Register an adapter. If an adapter with the same id exists, throws.
   * The native adapter is auto-registered at startup.
   */
  register(adapter: RuntimeAdapter): void;

  /**
   * Deregister an adapter by id. Calls disconnect() first.
   * Cannot deregister 'native'.
   */
  deregister(id: RuntimeId): Promise<void>;

  /**
   * Get the active adapter for a given capability tier.
   * Falls back to native if the preferred adapter is unhealthy.
   * Never returns null — native is always the final fallback.
   */
  getAdapter(tier: CapabilityTier): RuntimeAdapter;

  /**
   * Get a specific adapter by id. Throws if not registered.
   */
  getById(id: RuntimeId): RuntimeAdapter;

  /**
   * List all registered adapters with their health status.
   */
  listAdapters(): Array<{ adapter: RuntimeAdapter; health: HealthStatus }>;
}
