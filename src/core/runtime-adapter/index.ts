// ============================================================
// Runtime Adapter Layer — Public API
// ROS vNext · Phase 9a+9b
//
// Import from this module to use the Runtime Adapter Layer.
// All public types and implementations are re-exported here.
// ============================================================

// ── Types ────────────────────────────────────────────────────

export type {
  // Core identifiers
  RuntimeId,
  CapabilityTier,
  HealthState,

  // Capability & configuration
  RuntimeCapabilities,
  RuntimeConfig,

  // Tool execution
  ToolCall,
  ToolResult,

  // Error hierarchy
  ToolErrorClass,
  ToolError,

  // Discovery
  ToolDefinition,
  PluginInfo,

  // Health
  HealthStatus,

  // Events
  RuntimeEventType,
  RuntimeEvent,

  // Core interfaces
  RuntimeAdapter,
  RuntimeAdapterRegistry,
} from './types';

// ── Implementations ──────────────────────────────────────────

export { NativeRuntimeAdapter } from './native-adapter';
export { RuntimeAdapterRegistryImpl } from './registry';
