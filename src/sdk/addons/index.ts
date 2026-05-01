// Intent citation: docs/architecture/ADR-018-addon-sdk-v0.md

export type {
  AddOnAugmentorSkill,
  AddOnArtifactReference,
  AddOnEngineerSetupRunbook,
  AddOnRegistryEntry,
  AddOnRegistryReviewState,
  AddOnRegistrySource,
  AddOnManifest,
  AddOnToolDefinition,
  Capability,
  CapabilityGrant,
} from "../../core/contracts";
export {
  ADDON_CAPABILITIES,
  ADDON_SDK_VERSION,
  ADDON_SERVICE_PROTOCOLS,
  type AddOnManifestSource,
  type AddOnManifestValidationResult,
  type AddOnSdkManifest,
  type AddOnValidationIssue,
} from "./contracts";
export { createAddOnRegistryEntry, createAddOnRegistrySnapshot } from "./registry";
export type { AddOnRegistryBuildInput, AddOnRegistryEntryOptions, AddOnRegistrySnapshot } from "./registry";
export { assertValidAddOnManifest, validateAddOnManifest } from "./validation";
