// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md

import type {
  AuthTier,
  ProviderAuthMethod,
  ProviderModelContextPolicy,
  ProviderType,
  RuntimeNodeKind,
  RuntimeNodeLocality,
} from "../../core/contracts";

export type ProviderTemplateId = "minimax" | "openai" | "anthropic" | "google" | "openai-compatible" | "local";

export type ProviderTemplate = {
  id: ProviderTemplateId;
  label: string;
  shortLabel: string;
  providerType: ProviderType;
  authMethod: ProviderAuthMethod;
  authTier: AuthTier;
  defaultApiBaseUrl?: string;
  requiresSecret: boolean;
  requiresBaseUrl: boolean;
  allowedModels: string[];
  primaryModel: string;
  fallbackModel?: string;
  consumerScopes: string[];
  runtimeKind: RuntimeNodeKind;
  runtimeLocality: RuntimeNodeLocality;
  modelContext: ProviderModelContextPolicy[];
  note: string;
};

const contextPolicy = (
  model: string,
  maxContextTokens: number,
  source: ProviderModelContextPolicy["source"] = "provider-default",
): ProviderModelContextPolicy => ({
  model,
  maxContextTokens,
  tokenEstimateMethod: "provider-metadata",
  source,
});

export const providerTemplates: ProviderTemplate[] = [
  {
    id: "minimax",
    label: "MiniMax",
    shortLabel: "MiniMax",
    providerType: "minimax",
    authMethod: "subscription",
    authTier: "experimental",
    defaultApiBaseUrl: "https://api.minimax.io/v1",
    requiresSecret: true,
    requiresBaseUrl: false,
    allowedModels: ["MiniMax-M2.7", "MiniMax-M2.7-highspeed"],
    primaryModel: "MiniMax-M2.7",
    fallbackModel: "MiniMax-M2.7-highspeed",
    consumerScopes: ["strategist", "setup", "archive-ingest", "telegram-channel"],
    runtimeKind: "cloud",
    runtimeLocality: "cloud",
    modelContext: [contextPolicy("MiniMax-M2.7", 64_000), contextPolicy("MiniMax-M2.7-highspeed", 64_000)],
    note: "Best for your current Augmentor and Engineer primary route when MiniMax credentials are configured.",
  },
  {
    id: "openai",
    label: "OpenAI",
    shortLabel: "OpenAI",
    providerType: "openai",
    authMethod: "api-key",
    authTier: "supported",
    defaultApiBaseUrl: "https://api.openai.com/v1",
    requiresSecret: true,
    requiresBaseUrl: false,
    allowedModels: ["gpt-5.4", "gpt-5.4-mini"],
    primaryModel: "gpt-5.4",
    fallbackModel: "gpt-5.4-mini",
    consumerScopes: ["strategist", "setup", "archive-ingest"],
    runtimeKind: "cloud",
    runtimeLocality: "cloud",
    modelContext: [contextPolicy("gpt-5.4", 128_000), contextPolicy("gpt-5.4-mini", 128_000)],
    note: "Use for demanding reasoning, coding, and trusted archive ingest when cost policy allows it.",
  },
  {
    id: "anthropic",
    label: "Anthropic",
    shortLabel: "Anthropic",
    providerType: "anthropic",
    authMethod: "api-key",
    authTier: "supported",
    defaultApiBaseUrl: "https://api.anthropic.com",
    requiresSecret: true,
    requiresBaseUrl: false,
    allowedModels: ["claude-sonnet-4.5", "claude-haiku-4.5"],
    primaryModel: "claude-sonnet-4.5",
    fallbackModel: "claude-haiku-4.5",
    consumerScopes: ["strategist", "setup", "coding"],
    runtimeKind: "cloud",
    runtimeLocality: "cloud",
    modelContext: [contextPolicy("claude-sonnet-4.5", 200_000), contextPolicy("claude-haiku-4.5", 200_000)],
    note: "Cloud API route for agentic reasoning once the Anthropic execution adapter is enabled.",
  },
  {
    id: "google",
    label: "Google Gemini",
    shortLabel: "Gemini",
    providerType: "google",
    authMethod: "api-key",
    authTier: "supported",
    defaultApiBaseUrl: "https://generativelanguage.googleapis.com",
    requiresSecret: true,
    requiresBaseUrl: false,
    allowedModels: ["gemini-2.5-pro", "gemini-2.5-flash"],
    primaryModel: "gemini-2.5-pro",
    fallbackModel: "gemini-2.5-flash",
    consumerScopes: ["strategist", "setup", "archive-ingest"],
    runtimeKind: "cloud",
    runtimeLocality: "cloud",
    modelContext: [contextPolicy("gemini-2.5-pro", 1_000_000), contextPolicy("gemini-2.5-flash", 1_000_000)],
    note: "Large-context cloud route once the Gemini execution adapter is enabled.",
  },
  {
    id: "openai-compatible",
    label: "OpenAI-Compatible API",
    shortLabel: "Compatible",
    providerType: "openai-compatible",
    authMethod: "api-key",
    authTier: "supported",
    requiresSecret: true,
    requiresBaseUrl: true,
    allowedModels: ["model-id"],
    primaryModel: "model-id",
    consumerScopes: ["strategist", "setup"],
    runtimeKind: "cloud",
    runtimeLocality: "cloud",
    modelContext: [contextPolicy("model-id", 32_000, "user-config")],
    note: "Use this for hosted providers that expose an OpenAI-compatible chat API.",
  },
  {
    id: "local",
    label: "Local Runtime",
    shortLabel: "Local",
    providerType: "local",
    authMethod: "local-runtime",
    authTier: "supported",
    defaultApiBaseUrl: "http://127.0.0.1:11434",
    requiresSecret: false,
    requiresBaseUrl: true,
    allowedModels: ["batiai/gemma4-e2b:q4", "qwen3:4b", "llama3.2:1b"],
    primaryModel: "batiai/gemma4-e2b:q4",
    fallbackModel: "qwen3:4b",
    consumerScopes: ["setup", "recovery", "routine"],
    runtimeKind: "local",
    runtimeLocality: "desktop-local",
    modelContext: [
      contextPolicy("batiai/gemma4-e2b:q4", 8_192, "runtime-node"),
      contextPolicy("qwen3:4b", 32_000, "runtime-node"),
      contextPolicy("llama3.2:1b", 8_192, "runtime-node"),
    ],
    note: "Local fallback route for recovery and low-cost routine work.",
  },
];

export const findProviderTemplate = (templateId: ProviderTemplateId): ProviderTemplate | undefined =>
  providerTemplates.find((template) => template.id === templateId);
