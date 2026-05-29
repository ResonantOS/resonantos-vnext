import { metricCard, noteCard, safeErrorMessage, setStatus, settingsHeader } from "./settings-common.js";

function serviceStatus(result) {
  if (result.status === "rejected") {
    return { value: "Error", detail: safeErrorMessage(result.reason), tone: "warning" };
  }
  return { value: "Ready", detail: "host-mediated status endpoint responded", tone: "success" };
}

function diagnosticsRow({ label, value, detail = "" }) {
  const row = document.createElement("li");
  row.className = "settings-diagnostics-row";
  const heading = document.createElement("strong");
  heading.textContent = label;
  const valueNode = document.createElement("span");
  valueNode.textContent = value;
  const detailNode = document.createElement("small");
  detailNode.textContent = detail;
  row.append(heading, valueNode, detailNode);
  return row;
}

export function renderDiagnosticsSection(container, { bridgeRequest }) {
  const statusNode = document.createElement("p");
  statusNode.className = "settings-status";
  statusNode.textContent = "Checking diagnostics endpoints...";
  const grid = document.createElement("div");
  grid.className = "settings-health-grid";
  grid.append(
    metricCard({ label: "Bridge", value: "Checking", detail: "loading system status" }),
    metricCard({ label: "Providers", value: "Checking", detail: "loading provider status" }),
    metricCard({ label: "Add-ons", value: "Checking", detail: "loading add-on status" }),
    metricCard({ label: "Memory", value: "Checking", detail: "loading memory status" })
  );

  const details = document.createElement("ol");
  details.className = "settings-diagnostics-list";

  const exportCard = noteCard({
    title: "Redacted support report",
    body: "Export a local diagnostics report for debugging. Provider credentials, bridge tokens, wallet secrets, private keys, and full home paths must not be included."
  });
  const exportButton = document.createElement("button");
  exportButton.type = "button";
  exportButton.className = "settings-primary-action";
  exportButton.textContent = "Export Redacted Report";
  const exportStatus = document.createElement("p");
  exportStatus.className = "settings-status";
  exportStatus.textContent = "No report exported yet.";
  exportCard.append(exportButton, exportStatus);

  container.replaceChildren(
    settingsHeader({
      eyebrow: "Logs and diagnostics",
      title: "Diagnostics",
      body: "Check the browser bridge, provider fabric, add-on registry, and memory-system status without exposing private credentials."
    }),
    statusNode,
    grid,
    details,
    exportCard
  );

  exportButton.addEventListener("click", async () => {
    exportButton.disabled = true;
    setStatus(exportStatus, "Exporting redacted diagnostics report...");
    try {
      const result = await bridgeRequest("/diagnostics/report", {
        method: "POST",
        capability: "diagnostics-report-export",
        body: { scope: "settings" }
      });
      setStatus(exportStatus, `Report exported: ${result.path}`, "success");
    } catch (error) {
      setStatus(exportStatus, `Report export failed: ${safeErrorMessage(error)}`, "error");
    } finally {
      exportButton.disabled = false;
    }
  });

  const load = async () => {
    const [statusResult, providerResult, addonResult, memoryResult] = await Promise.allSettled([
      bridgeRequest("/status", { method: "GET" }),
      bridgeRequest("/providers/status", { method: "GET" }),
      bridgeRequest("/addons/status", { method: "GET" }),
      bridgeRequest("/memory/status", { method: "GET" })
    ]);
    const statusValue = serviceStatus(statusResult);
    const providerValue = serviceStatus(providerResult);
    const addonValue = serviceStatus(addonResult);
    const memoryValue = serviceStatus(memoryResult);
    grid.replaceChildren(
      metricCard({ label: "Bridge", ...statusValue }),
      metricCard({ label: "Providers", ...providerValue }),
      metricCard({ label: "Add-ons", ...addonValue }),
      metricCard({ label: "Memory", ...memoryValue })
    );

    const providers = providerResult.status === "fulfilled" ? providerResult.value.providers ?? [] : [];
    const addons = addonResult.status === "fulfilled" ? addonResult.value.addons ?? [] : [];
    const memory = memoryResult.status === "fulfilled" ? memoryResult.value : null;
    const system = statusResult.status === "fulfilled" ? statusResult.value : null;
    details.replaceChildren(
      diagnosticsRow({
        label: "Bridge",
        value: system?.bridge ?? "Unavailable",
        detail: statusResult.status === "fulfilled" ? "Core bridge responded." : safeErrorMessage(statusResult.reason)
      }),
      diagnosticsRow({
        label: "Providers",
        value: `${providers.filter((provider) => provider.configured).length}/${providers.length}`,
        detail: "configured provider profiles"
      }),
      diagnosticsRow({
        label: "Add-ons",
        value: `${addons.filter((addon) => addon.available || addon.enabled).length}/${addons.length}`,
        detail: "available add-ons"
      }),
      diagnosticsRow({
        label: "Memory",
        value: `${memory?.wiki?.pages ?? 0} pages`,
        detail: `${memory?.intake?.artifacts ?? 0} intake artifacts`
      })
    );
    const failed = [statusResult, providerResult, addonResult, memoryResult].filter((result) => result.status === "rejected").length;
    setStatus(statusNode, failed
      ? `Diagnostics loaded with ${failed} unavailable endpoint${failed === 1 ? "" : "s"}.`
      : "Diagnostics loaded from host-mediated status endpoints.",
      failed ? "warning" : "success"
    );
  };

  void load().catch((error) => {
    setStatus(statusNode, `Diagnostics unavailable: ${safeErrorMessage(error)}`, "error");
  });
}
