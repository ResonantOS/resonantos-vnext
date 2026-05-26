export function controlResultSummary(result = {}) {
  if (!result?.ok) {
    if (result?.approvalRequired) return result?.error ?? "human approval required";
    return result?.error ?? "action failed";
  }
  if (result.clickedText) return `clicked "${String(result.clickedText).slice(0, 80)}"`;
  if (result.typedText) return result.submitted ? `typed and submitted "${String(result.typedText).slice(0, 80)}"` : `typed "${String(result.typedText).slice(0, 80)}"`;
  if (result.url) return `opened ${result.url}`;
  if (result.query) return `searched "${String(result.query).slice(0, 80)}"`;
  if (result.direction) return `scrolled ${result.direction}`;
  if (result.snapshot?.title || result.snapshot?.url) return `read ${result.snapshot.title || result.snapshot.url}`;
  if (Array.isArray(result.tabs)) return `checked ${result.tabs.length} tabs`;
  if (Array.isArray(result.forms)) return `found ${result.forms.length} forms`;
  if (result.waitedMs) return `waited ${result.waitedMs}ms`;
  return "completed";
}

export function createAgentControlRunner(deps) {
  const {
    addMessage,
    appendControlStep,
    controlStepLabel,
    createBrowserJob,
    executeControlStep,
    finishControlRun,
    getActiveJobId,
    getCurrentControlRun,
    getLastSnapshot,
    renderControlMonitor,
    requestNextControlAction,
    saveControlReportToArchive,
    setActivity,
    setPendingApproval,
    setStatus,
    sleep,
    startControlRun,
    updateBrowserJob,
    updateControlRunArtifacts,
    updateControlStep
  } = deps;

  async function continueControlLoop({ goal, history = [], results = [], startIndex = 0, maxSteps = 12 } = {}) {
    try {
      for (let loopIndex = startIndex; loopIndex < maxSteps; loopIndex += 1) {
        await updateBrowserJob(getActiveJobId(), { status: "running" });
        const snapshot = await deps.observeControlPage();
        setActivity("thinking", "Deciding next browser action", `Loop ${loopIndex + 1}/${maxSteps}`);
        setStatus("Deciding");
        const decision = await requestNextControlAction({ goal, snapshot, history });
        if (decision.thought) {
          setActivity("thinking", decision.thought, decision.action ? controlStepLabel(decision.action) : decision.status);
        }
        if (decision.status === "done") {
          const archiveResult = await saveControlReportToArchive(results, "completed");
          const artifact = archiveResult?.path ? { type: "archive-intake", path: archiveResult.path } : null;
          finishControlRun("completed", artifact);
          await addMessage(
            "system",
            [
              "Agent Control Mode completed.",
              `Goal: ${goal}`,
              "",
              decision.doneSummary ?? "The observed page state satisfies the goal.",
              "",
              "Completed actions:",
              ...(results.length ? results.map(({ step }, index) => `${index + 1}. ${controlStepLabel(step)}`) : ["- No browser mutation was needed."])
            ].join("\n")
          );
          setStatus("Ready");
          setActivity("completed", "Control mode completed", goal);
          return { ok: true, results };
        }
        if (decision.status === "needs_approval" || decision.status === "blocked" || !decision.action) {
          const isApproval = decision.status === "needs_approval" && Boolean(decision.action);
          finishControlRun(isApproval ? "approval" : "blocked");
          setStatus(isApproval ? "Needs approval" : "Control blocked");
          setActivity("failed", isApproval ? "Control mode needs approval" : "Control mode blocked", decision.approvalReason);
          await addMessage(
            "system",
            [
              `Agent Control Mode ${isApproval ? "needs approval" : "blocked"}.`,
              `Goal: ${goal}`,
              `Reason: ${decision.approvalReason ?? decision.thought ?? "No safe next action is available."}`
            ].join("\n")
          );
          await saveControlReportToArchive(results, isApproval ? "approval-required" : "blocked");
          return { ok: false, results, approvalRequired: isApproval };
        }

        const step = decision.action;
        const stepIndex = appendControlStep(step);
        updateControlStep(stepIndex, "active", decision.thought);
        setActivity("tool-running", `Executing browser action ${stepIndex + 1}`, controlStepLabel(step));
        const result = await executeControlStep(step);
        results.push({ step, result });
        history.push({
          action: step,
          result: {
            ok: Boolean(result?.ok),
            approvalRequired: Boolean(result?.approvalRequired),
            error: result?.error ?? null,
            clickedText: result?.clickedText ?? null,
            typedText: result?.typedText ?? null,
            url: result?.url ?? null,
            query: result?.query ?? null
          },
          observation: {
            title: getLastSnapshot()?.title ?? snapshot?.title ?? null,
            url: getLastSnapshot()?.url ?? snapshot?.url ?? null
          }
        });
        if (!result?.ok) {
          const status = result?.approvalRequired ? "approval" : "blocked";
          const reason = result?.approvalRequired
            ? "Stopped because this step requires human approval."
            : `Stopped because this step failed: ${result?.error ?? "unknown error"}`;
          updateControlStep(stepIndex, result?.approvalRequired ? "blocked" : "failed", controlResultSummary(result));
          finishControlRun(status);
          setStatus(result?.approvalRequired ? "Needs approval" : "Control blocked");
          setActivity("failed", "Control mode blocked", controlStepLabel(step));
          await addMessage("system", `Agent Control Mode blocked at action ${stepIndex + 1}: ${controlStepLabel(step)}\n${reason}`);
          if (result?.approvalRequired) {
            setPendingApproval({
              step: { ...step },
              stepIndex,
              reason: result?.error ?? "This browser action requires human approval.",
              results,
              history
            });
            renderControlMonitor();
          }
          const archiveResult = await saveControlReportToArchive(results, result?.approvalRequired ? "approval-required" : "blocked");
          if (archiveResult?.path) {
            const artifacts = [...(getCurrentControlRun()?.artifacts ?? []), { type: "archive-intake", path: archiveResult.path }];
            updateControlRunArtifacts(artifacts);
            renderControlMonitor();
            await updateBrowserJob(getCurrentControlRun()?.id, { artifacts });
          }
          return { ok: false, results, approvalRequired: Boolean(result?.approvalRequired) };
        }
        updateControlStep(stepIndex, "completed", controlResultSummary(result));
        await sleep(350);
      }

      finishControlRun("blocked");
      setStatus("Control blocked");
      setActivity("failed", "Control loop reached safety limit", `${maxSteps} actions`);
      await addMessage("system", `Agent Control Mode stopped after ${maxSteps} actions. The task did not reach a verified completion state.`);
      await saveControlReportToArchive(results, "blocked-step-limit");
      return { ok: false, results };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const status = /cancelled/i.test(message) ? "cancelled" : /paused/i.test(message) ? "paused" : "failed";
      finishControlRun(status);
      await updateBrowserJob(getActiveJobId(), { status, lastError: message });
      setStatus(status === "paused" ? "Paused" : status === "cancelled" ? "Cancelled" : "Control failed");
      setActivity(status === "paused" ? "paused" : "failed", `Control mode ${status}`, message);
      await addMessage("system", `Agent Control Mode ${status}.\nGoal: ${goal}\nReason: ${message}`);
      return { ok: false, results, error: message };
    }
  }

  async function runControlCommand(body) {
    const goal = String(body ?? "").trim();
    if (!goal) {
      await addMessage("system", "Use `/control <browser goal>` or ask Augmentor to operate the current page.");
      return;
    }
    setStatus("Taking control");
    setActivity("tool-running", "Agent Control Mode", goal);
    const job = await createBrowserJob({
      goal,
      planner: "observe-act-verify-loop",
      summary: "Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing."
    });
    startControlRun({
      goal,
      plan: {
        source: "observe-act-verify-loop",
        summary: "Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing.",
        steps: []
      }
    });
    await addMessage(
      "system",
      [
        "Agent Control Mode started.",
        `Job: ${job.id}`,
        `Goal: ${goal}`,
        "Mode: observe -> decide -> act -> verify.",
        "",
        "Approval boundary: wallet, login, payment, credential, public submit, and destructive actions remain blocked unless a human approval flow authorizes them."
      ].join("\n")
    );
    return continueControlLoop({ goal, history: [], results: [] });
  }

  async function approvePendingControlStep(approval) {
    if (!approval || !getCurrentControlRun()) return;
    setPendingApproval(null);
    renderControlMonitor();
    setStatus("Approved once");
    setActivity("tool-running", "Executing approved browser step", controlStepLabel(approval.step));
    await addMessage("system", `Human approved this browser action once: ${controlStepLabel(approval.step)}`);

    const step = { ...approval.step, userApproved: true };
    const results = approval.results.slice(0, approval.results.length - 1);
    updateControlStep(approval.stepIndex, "active", "approved once");
    const result = await executeControlStep(step);
    results.push({ step, result });
    if (!result?.ok) {
      updateControlStep(approval.stepIndex, result?.approvalRequired ? "blocked" : "failed", controlResultSummary(result));
      finishControlRun(result?.approvalRequired ? "approval" : "blocked");
      setStatus(result?.approvalRequired ? "Needs approval" : "Control blocked");
      setActivity("failed", "Control mode blocked", controlStepLabel(step));
      await addMessage("system", `Agent Control Mode blocked after approval: ${controlStepLabel(step)}\n${result?.error ?? "unknown error"}`);
      await saveControlReportToArchive(results, result?.approvalRequired ? "approval-required" : "blocked");
      return;
    }
    updateControlStep(approval.stepIndex, "completed", controlResultSummary(result));
    const history = [
      ...(approval.history ?? []),
      {
        action: step,
        result: {
          ok: true,
          approvalRequired: false,
          clickedText: result?.clickedText ?? null,
          typedText: result?.typedText ?? null
        },
        observation: {
          title: getLastSnapshot()?.title ?? null,
          url: getLastSnapshot()?.url ?? null
        }
      }
    ];
    await continueControlLoop({
      goal: getCurrentControlRun().goal,
      history,
      results,
      startIndex: history.length,
      maxSteps: 12
    });
  }

  async function denyPendingControlStep(denied) {
    if (!denied || !getCurrentControlRun()) return;
    setPendingApproval(null);
    updateControlStep(denied.stepIndex, "blocked", "denied by human");
    finishControlRun("denied");
    renderControlMonitor();
    setStatus("Denied");
    setActivity("failed", "Approval denied", controlStepLabel(denied.step));
    await addMessage("system", `Denied browser action: ${controlStepLabel(denied.step)}. The task remains stopped.`);
    await saveControlReportToArchive(denied.results, "denied");
  }

  return {
    approvePendingControlStep,
    continueControlLoop,
    denyPendingControlStep,
    runControlCommand
  };
}
