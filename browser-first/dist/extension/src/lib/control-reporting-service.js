export function createControlReportingService({
  addMessage,
  bridgeRequest,
  controlStepLabel,
  getCurrentControlRun,
  getLastSnapshot,
  getPendingApproval
}) {
  const buildControlReport = (results, status) => {
    const currentControlRun = getCurrentControlRun();
    if (!currentControlRun) return "";
    const lastSnapshot = getLastSnapshot();
    return [
      "# Browser Agent Control Report",
      "",
      `- id: ${currentControlRun.id}`,
      `- status: ${status}`,
      `- planner: ${currentControlRun.planner}`,
      `- startedAt: ${currentControlRun.startedAt}`,
      `- completedAt: ${new Date().toISOString()}`,
      `- page: ${lastSnapshot?.title ?? "unknown"} (${lastSnapshot?.url ?? "unknown"})`,
      "",
      "## Goal",
      currentControlRun.goal,
      "",
      "## Plan",
      currentControlRun.summary,
      "",
      "## Steps",
      ...results.map(({ step, result }, index) => `${index + 1}. ${controlStepLabel(step)} — ${result?.ok ? "ok" : result?.approvalRequired ? "approval-required" : "failed"}${result?.error ? ` — ${result.error}` : ""}`),
      "",
      "## Boundary",
      "This is an intake artifact only. Wallet, credential, public-submit, payment, and destructive actions require explicit human approval.",
      ""
    ].join("\n");
  };

  const saveControlReportToArchive = async (results, status) => {
    const currentControlRun = getCurrentControlRun();
    const lastSnapshot = getLastSnapshot();
    const content = buildControlReport(results, status);
    if (!content) return null;
    return bridgeRequest("/archive/intake", {
      method: "POST",
      body: {
        title: `Browser control ${status}: ${currentControlRun?.goal ?? "task"}`.slice(0, 160),
        content,
        url: lastSnapshot?.url ?? null,
        sourceMessageId: currentControlRun?.id ?? null
      }
    }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
  };

  const delegateControlIssue = async () => {
    const pendingApproval = getPendingApproval();
    const currentControlRun = getCurrentControlRun();
    if (!pendingApproval && !currentControlRun) return;
    const step = pendingApproval?.step;
    const result = await bridgeRequest("/addons/delegate", {
      method: "POST",
      body: {
        target: "engineer",
        mission: [
          "Investigate blocked browser-control task.",
          `Goal: ${currentControlRun?.goal ?? "unknown"}`,
          step ? `Blocked step: ${controlStepLabel(step)}` : "",
          pendingApproval?.reason ? `Reason: ${pendingApproval.reason}` : ""
        ].filter(Boolean).join("\n")
      }
    }).catch((error) => ({ error: error instanceof Error ? error.message : String(error) }));
    await addMessage(
      "system",
      result.error ? `Delegation failed: ${result.error}` : `Delegated blocked control task to ${result.target}: ${result.id}`
    );
  };

  return {
    buildControlReport,
    delegateControlIssue,
    saveControlReportToArchive
  };
}
