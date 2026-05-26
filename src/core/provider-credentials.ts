// Intent citation: docs/architecture/ADR-005-provider-fabric-routing.md

type ProviderCredentialPolicyInput = {
  providerType: string;
  authMethod: string;
  credentialStatus?: string;
};

export const providerNeedsStoredCredential = (provider: Pick<ProviderCredentialPolicyInput, "providerType" | "authMethod">): boolean =>
  provider.providerType !== "local" && provider.authMethod !== "local-runtime";

export const providerCredentialReady = (provider: ProviderCredentialPolicyInput): boolean =>
  !providerNeedsStoredCredential(provider) || provider.credentialStatus === "configured";
