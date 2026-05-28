export function createSitePermissionStore({
  storage,
  sitePermissionStorageKey
}) {
  const siteKeyForUrl = (url) => {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return "";
    }
  };

  const sitePermissions = async () => {
    const result = await storage?.get?.(sitePermissionStorageKey).catch(() => ({}));
    return result?.[sitePermissionStorageKey] ?? {};
  };

  const permissionForUrl = async (url) => {
    const key = siteKeyForUrl(url);
    if (!key) return "ask-before-action";
    return (await sitePermissions())[key] ?? "ask-before-action";
  };

  const setSitePermission = async (url, mode) => {
    const key = siteKeyForUrl(url);
    if (!key) throw new Error("No site is active.");
    const permissions = await sitePermissions();
    permissions[key] = mode;
    await storage?.set?.({ [sitePermissionStorageKey]: permissions });
    return { key, mode };
  };

  return {
    permissionForUrl,
    setSitePermission,
    siteKeyForUrl,
    sitePermissions
  };
}
