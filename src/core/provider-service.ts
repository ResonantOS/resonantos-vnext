// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md
// Intent citation: docs/architecture/ADR-009-rust-service-ipc-boundary.md

import type {
  ProviderExecutionAdapterPolicy,
  ProviderProfile,
  ProviderRoutingDecision,
  ProviderRuntimeNode,
  ResonantShellState,
  StrategyRouteReference,
  WorkloadClass,
  WorkloadStrategy,
} from "./contracts";
import { resolveProviderRoute } from "./policies";

export type ProviderRouteResolution = {
  decision: ProviderRoutingDecision;
  provider?: ProviderProfile;
  runtimeNode?: ProviderRuntimeNode;
  model?: string;
  executionAdapter?: ProviderExecutionAdapterPolicy;
};

export const resolveAgentChatRoute = (
  state: ResonantShellState,
  agentId: string,
  preferredModel?: string,
): ProviderRouteResolution => {
  const agent = state.agents.find((item) => item.id === agentId);
  const strategy = strategyForAgent(state, agentId);
  const isRecoveryAgent = agentId === state.recoverySession.engineerAgentId;
  const localRecoveryPinned = agent?.providerProfileId === "shared-local" && !isRecoveryAgent;
  const usingStrategy = Boolean(strategy) && !localRecoveryPinned && agent?.providerProfileId === strategy?.primaryRoute.providerProfileId;
  const decision = usingStrategy && strategy
    ? resolveStrategyRoute(state, strategy, {
        consumerId: agent?.id ?? agentId,
        preferredModel,
        allowedRuntimeKinds: isRecoveryAgent ? ["local", "cloud", "remote-user-owned"] : ["cloud", "local", "remote-user-owned"],
        preferredLocalities: isRecoveryAgent ? ["desktop-local", "cloud", "lan-remote"] : ["cloud", "desktop-local", "lan-remote"],
      })
    : resolveProviderRoute(state, {
        consumerId: agent?.id ?? agentId,
        primaryProviderProfileId: agent?.providerProfileId,
        fallbackProviderProfileId: agent?.fallbackProviderProfileId,
        preferredModels: preferredModel ? [preferredModel] : undefined,
        allowedRuntimeKinds: isRecoveryAgent ? ["local", "cloud", "remote-user-owned"] : localRecoveryPinned ? ["local"] : ["cloud", "local", "remote-user-owned"],
        preferredLocalities: isRecoveryAgent ? ["desktop-local", "cloud", "lan-remote"] : localRecoveryPinned ? ["desktop-local"] : ["cloud", "desktop-local", "lan-remote"],
        fallbackPolicyId: localRecoveryPinned ? "strict-supported-only" : "core-default",
        allowResurrection: true,
      });

  const provider = state.providers.find((profile) => profile.id === decision.providerProfileId);
  const runtimeNode = state.runtimeNodes.find((node) => node.id === decision.runtimeNodeId);
  return {
    decision,
    provider,
    runtimeNode,
    model: decision.model ?? provider?.primaryModel,
    executionAdapter: state.providerRouting.executionAdapters.find((adapter) => adapter.id === decision.executionAdapterId),
  };
};

export const resolveStrategistChatRoute = (
  state: ResonantShellState,
  preferredModel?: string,
): ProviderRouteResolution => resolveAgentChatRoute(state, "strategist.core", preferredModel);

export const resolveWorkloadRoute = (
  state: ResonantShellState,
  workloadClass: WorkloadClass,
  preferredModel?: string,
): ProviderRouteResolution => {
  const strategy = strategyForWorkload(state, workloadClass);
  const decision = strategy
    ? resolveStrategyRoute(state, strategy, {
        consumerId: `workload:${workloadClass}`,
        preferredModel,
        allowedRuntimeKinds: workloadClass === "archive-ingest" ? ["cloud"] : ["cloud", "local", "remote-user-owned"],
        preferredLocalities: workloadClass === "archive-ingest" ? ["cloud"] : ["cloud", "lan-remote", "desktop-local"],
      })
    : resolveProviderRoute(state, {
        consumerId: `workload:${workloadClass}`,
        preferredModels: preferredModel ? [preferredModel] : undefined,
        allowedRuntimeKinds: workloadClass === "archive-ingest" ? ["cloud"] : ["cloud", "local", "remote-user-owned"],
        preferredLocalities: workloadClass === "archive-ingest" ? ["cloud"] : ["cloud", "lan-remote", "desktop-local"],
        fallbackPolicyId: workloadClass === "archive-ingest" ? "core-default" : "core-default",
        allowResurrection: workloadClass !== "archive-ingest",
      });

  const provider = state.providers.find((profile) => profile.id === decision.providerProfileId);
  const runtimeNode = state.runtimeNodes.find((node) => node.id === decision.runtimeNodeId);
  return {
    decision,
    provider,
    runtimeNode,
    model: decision.model ?? provider?.primaryModel,
    executionAdapter: state.providerRouting.executionAdapters.find((adapter) => adapter.id === decision.executionAdapterId),
  };
};

export const resolveArchiveIngestRoute = (
  state: ResonantShellState,
  preferredModel?: string,
): ProviderRouteResolution => resolveWorkloadRoute(state, "archive-ingest", preferredModel);

export const resolveRoutineRoute = (
  state: ResonantShellState,
  preferredModel?: string,
): ProviderRouteResolution => resolveWorkloadRoute(state, "routine", preferredModel);

export const routedProviderLabel = (route: ProviderRouteResolution): string => {
  if (!route.provider) {
    return "Missing";
  }
  return route.runtimeNode ? `${route.provider.label} via ${route.runtimeNode.label}` : route.provider.label;
};

const strategyForAgent = (state: ResonantShellState, agentId: string): WorkloadStrategy | undefined =>
  state.modelStrategy.workloadStrategies.find((strategy) => strategy.ownerType === "agent" && strategy.ownerId === agentId);

const strategyForWorkload = (state: ResonantShellState, workloadClass: WorkloadClass): WorkloadStrategy | undefined =>
  state.modelStrategy.workloadStrategies.find(
    (strategy) => strategy.ownerType === "workload" && strategy.ownerId === workloadClass,
  );

const expandStrategyRoutes = (state: ResonantShellState, strategy: WorkloadStrategy): StrategyRouteReference[] => {
  const chain = state.modelStrategy.fallbackChains.find((item) => item.id === strategy.fallbackChainId);
  if (!chain) {
    return [strategy.primaryRoute];
  }
  return [
    strategy.primaryRoute,
    ...chain.orderedRoutes,
    ...(chain.lastResortRoute ? [chain.lastResortRoute] : []),
  ];
};

const resolveStrategyRoute = (
  state: ResonantShellState,
  strategy: WorkloadStrategy,
  options: {
    consumerId: string;
    preferredModel?: string;
    allowedRuntimeKinds?: Array<ProviderRuntimeNode["kind"]>;
    preferredLocalities?: Array<ProviderRuntimeNode["locality"]>;
  },
): ProviderRoutingDecision => {
  const strategyRoutes = expandStrategyRoutes(state, strategy);
  return resolveProviderRoute(state, {
    consumerId: options.consumerId,
    allowedProviderProfileIds: uniqueValues(strategyRoutes.map((route) => route.providerProfileId)),
    primaryProviderProfileId: strategy.primaryRoute.providerProfileId,
    fallbackProviderProfileId: strategyRoutes.find((route) => route.providerProfileId !== strategy.primaryRoute.providerProfileId)?.providerProfileId,
    preferredProviderProfileIds: uniqueValues(strategyRoutes.map((route) => route.providerProfileId)),
    preferredRuntimeNodeIds: uniqueValues(strategyRoutes.map((route) => route.runtimeNodeId)),
    preferredModels: options.preferredModel
      ? [options.preferredModel, ...uniqueValues(strategyRoutes.map((route) => route.model))]
      : uniqueValues(strategyRoutes.map((route) => route.model)),
    allowedRuntimeKinds: options.allowedRuntimeKinds,
    preferredLocalities: options.preferredLocalities,
    fallbackPolicyId: "core-default",
    allowResurrection: !strategy.hardStopWhenNoFallback,
  });
};

const uniqueValues = <T,>(values: Array<T | undefined>): T[] =>
  values.filter((value, index, items): value is T => value !== undefined && items.indexOf(value) === index);
