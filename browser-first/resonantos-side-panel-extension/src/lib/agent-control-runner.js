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

export function browserJobStepHistory(job = {}) {
  return Array.isArray(job?.steps)
    ? job.steps.slice(0, 12).map((step) => ({
      action: {
        type: step.type ?? "step",
        label: step.label ?? "Previous browser step"
      },
      result: {
        ok: step.state === "completed",
        approvalRequired: step.state === "blocked" || step.state === "approval",
        error: step.note || null
      },
      observation: {
        title: job.goal ?? null,
        url: null
      }
    }))
    : [];
}

function normalizedConfidence(value, fallback = "medium") {
  const normalized = String(value ?? "").toLowerCase();
  return ["high", "medium", "low"].includes(normalized) ? normalized : fallback;
}

function controlStepEvidence({ boundary = "safe", decision = {}, result = {}, status = "" } = {}) {
  const failed = result && result.ok === false;
  const approvalRequired = Boolean(result?.approvalRequired) || status === "approval";
  const hardBoundary = ["hard", "public-submit"].includes(boundary);
  const confidence = normalizedConfidence(
    decision.confidence,
    failed || approvalRequired || hardBoundary ? "low" : boundary === "safe" ? "medium" : "medium"
  );
  const uncertainty = String(
    decision.uncertainty ??
    decision.approvalReason ??
    (failed ? result?.error : "") ??
    ""
  ).trim();
  let nextHumanAction = "";
  if (approvalRequired && boundary === "hard") {
    nextHumanAction = "Complete this action manually in the page. Augmentor must not operate wallet, login, payment, credential, signing, or transfer controls.";
  } else if (approvalRequired) {
    nextHumanAction = "Review the visible page state, then approve once, deny, or delegate the blocker.";
  } else if (failed) {
    nextHumanAction = "Inspect the page state, adjust the instruction or target text, then resume or delegate the issue.";
  } else if (status === "blocked") {
    nextHumanAction = "Clarify the goal or provide a more concrete visible target before resuming.";
  }
  return {
    confidence,
    uncertainty: uncertainty || null,
    nextHumanAction: nextHumanAction || null
  };
}

function snapshotFingerprint(snapshot = null) {
  if (!snapshot || typeof snapshot !== "object") return "";
  const controls = Array.isArray(snapshot.controls) ? snapshot.controls.length : 0;
  const fields = Array.isArray(snapshot.fields) ? snapshot.fields.length : 0;
  const text = String(snapshot.text ?? "").replace(/\s+/g, " ").trim().slice(0, 1200);
  return [
    String(snapshot.title ?? "").trim(),
    String(snapshot.url ?? "").trim(),
    text,
    `controls:${controls}`,
    `fields:${fields}`
  ].join("\n");
}

function verifyBrowserAction({ before = null, after = null, result = {}, step = {} } = {}) {
  if (!["click", "type", "open", "search", "switch_tab"].includes(step?.type) || !result?.ok) {
    return { changed: null, uncertainty: null };
  }
  const beforeFingerprint = snapshotFingerprint(before);
  const afterFingerprint = snapshotFingerprint(after);
  if (!afterFingerprint) {
    return {
      changed: null,
      uncertainty: "Page verification could not read the state after this action."
    };
  }
  if (beforeFingerprint && beforeFingerprint === afterFingerprint) {
    return {
      changed: false,
      uncertainty: "No visible page-state change was detected after this action. The next step should verify whether the target was already satisfied, choose a more precise target, or stop safely."
    };
  }
  return { changed: true, uncertainty: null };
}

function browserActionSignature(action = {}) {
  if (!action || typeof action !== "object") return "";
  return JSON.stringify({
    direction: action.direction ?? "",
    field: action.field ?? "",
    query: action.query ?? "",
    ref: action.ref ?? "",
    submit: Boolean(action.submit),
    tabId: action.tabId ?? "",
    target: action.target ?? "",
    text: action.text ?? "",
    type: action.type ?? ""
  });
}

function repeatedNoChangeActionEvidence(history = [], action = {}) {
  const previous = [...history].reverse().find((entry) => entry?.action && entry?.result?.verificationChanged === false);
  if (!previous) return null;
  if (browserActionSignature(previous.action) !== browserActionSignature(action)) return null;
  return {
    previousAction: previous.action,
    reason: "The planner repeated the same action after the previous execution produced no visible page-state change.",
    nextHumanAction: "Inspect the page, choose a more precise visible target, or delegate the blocker before retrying this same action."
  };
}

export function createAgentControlRunner(deps) {
  const {
    addMessage,
    appendControlStep,
    approvalBoundaryForStep = () => "safe",
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
    setPageControlOverlay = async () => undefined,
    setPendingApproval,
    setStatus,
    sleep,
    startControlRun,
    taskConsentForStep = async () => null,
    updateBrowserJob,
    updateControlRunArtifacts,
    updateControlStep
  } = deps;

  async function continueControlLoop({ goal, history = [], results = [], startIndex = 0, maxSteps = 12 } = {}) {
    try {
      for (let loopIndex = startIndex; loopIndex < maxSteps; loopIndex += 1) {
        await updateBrowserJob(getActiveJobId(), { status: "running" });
        await setPageControlOverlay(true, "Reading page...", "reading");
        const snapshot = await deps.observeControlPage();
        await setPageControlOverlay(true, "Deciding next browser action...", "working");
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
        const repeatedNoChange = repeatedNoChangeActionEvidence(history, step);
        if (repeatedNoChange) {
          const stepIndex = appendControlStep(step);
          updateControlStep(stepIndex, "blocked", "repeat no-change action prevented", {
            phase: "blocked",
            observation: {
              title: snapshot?.title ?? null,
              url: snapshot?.url ?? null
            },
            decision: decision.thought ?? null,
            action: controlStepLabel(step),
            result: "repeat no-change action prevented",
            safetyClass: approvalBoundaryForStep(step),
            confidence: "low",
            uncertainty: repeatedNoChange.reason,
            nextHumanAction: repeatedNoChange.nextHumanAction
          });
          const blockedResult = {
            approvalRequired: false,
            error: repeatedNoChange.reason,
            ok: false,
            repeatNoChangePrevented: true
          };
          results.push({ step, result: blockedResult });
          history.push({
            action: step,
            result: {
              ok: false,
              approvalRequired: false,
              error: repeatedNoChange.reason,
              repeatNoChangePrevented: true,
              verificationChanged: false
            },
            observation: {
              title: snapshot?.title ?? null,
              url: snapshot?.url ?? null
            }
          });
          finishControlRun("blocked");
          setStatus("Control blocked");
          setActivity("failed", "Repeated no-change action blocked", controlStepLabel(step));
          await addMessage(
            "system",
            [
              `Agent Control Mode blocked at action ${stepIndex + 1}: ${controlStepLabel(step)}`,
              repeatedNoChange.reason,
              repeatedNoChange.nextHumanAction
            ].join("\n")
          );
          await saveControlReportToArchive(results, "blocked-repeat-no-change");
          return { ok: false, results, repeatNoChangePrevented: true };
        }
        const stepIndex = appendControlStep(step);
        updateControlStep(stepIndex, "active", decision.thought, {
          phase: "acting",
          observation: {
            title: snapshot?.title ?? null,
            url: snapshot?.url ?? null
          },
          decision: decision.thought ?? null,
          action: controlStepLabel(step),
          safetyClass: approvalBoundaryForStep(step),
          ...controlStepEvidence({
            boundary: approvalBoundaryForStep(step),
            decision
          })
        });
        await setPageControlOverlay(true, controlStepLabel(step), step.type === "click" ? "clicking" : step.type === "type" ? "typing" : step.type === "read" ? "reading" : step.type === "wait" ? "waiting" : "working");
        setActivity("tool-running", `Executing browser action ${stepIndex + 1}`, controlStepLabel(step));
        const result = await executeControlStep(step);
        await setPageControlOverlay(true, "Verifying page state...", "verifying");
        const verificationSnapshot = await deps.observeControlPage().catch(() => null);
        const verification = verifyBrowserAction({
          after: verificationSnapshot,
          before: snapshot,
          result,
          step
        });
        const boundary = approvalBoundaryForStep(step, result?.error);
        const consent = result?.approvalRequired && boundary === "safe"
          ? await taskConsentForStep({ goal, step, result })
          : null;
        const finalStep = consent ? { ...step, userApproved: true } : step;
        const finalResult = consent ? await executeControlStep(finalStep) : result;
        const finalVerification = consent
          ? verifyBrowserAction({
            after: await deps.observeControlPage().catch(() => verificationSnapshot),
            before: verificationSnapshot ?? snapshot,
            result: finalResult,
            step: finalStep
          })
          : verification;
        results.push({ step: finalStep, result: finalResult });
        history.push({
          action: finalStep,
          result: {
            ok: Boolean(finalResult?.ok),
            approvalRequired: Boolean(finalResult?.approvalRequired),
            error: finalResult?.error ?? null,
            clickedText: finalResult?.clickedText ?? null,
            typedText: finalResult?.typedText ?? null,
            url: finalResult?.url ?? null,
            query: finalResult?.query ?? null,
            taskConsent: consent ? `${consent.siteKey}::${consent.taskClass}` : null,
            verificationChanged: finalVerification.changed
          },
          observation: {
            title: verificationSnapshot?.title ?? getLastSnapshot()?.title ?? snapshot?.title ?? null,
            url: verificationSnapshot?.url ?? getLastSnapshot()?.url ?? snapshot?.url ?? null
          }
        });
        if (!finalResult?.ok) {
          const status = finalResult?.approvalRequired ? "approval" : "blocked";
          const reason = finalResult?.approvalRequired
            ? "Stopped because this step requires human approval."
            : `Stopped because this step failed: ${finalResult?.error ?? "unknown error"}`;
          updateControlStep(stepIndex, finalResult?.approvalRequired ? "blocked" : "failed", controlResultSummary(finalResult), {
            phase: finalResult?.approvalRequired ? "waiting-for-human" : "blocked",
            observation: {
              title: getLastSnapshot()?.title ?? snapshot?.title ?? null,
              url: getLastSnapshot()?.url ?? snapshot?.url ?? null
            },
            decision: decision.thought ?? null,
            action: controlStepLabel(finalStep),
            result: controlResultSummary(finalResult),
            safetyClass: boundary,
            ...controlStepEvidence({
              boundary,
              decision,
              result: finalResult,
              status
            })
          });
          finishControlRun(status);
          setStatus(finalResult?.approvalRequired ? "Needs approval" : "Control blocked");
          setActivity("failed", "Control mode blocked", controlStepLabel(step));
          await addMessage("system", `Agent Control Mode blocked at action ${stepIndex + 1}: ${controlStepLabel(step)}\n${reason}`);
          if (finalResult?.approvalRequired) {
            setPendingApproval({
              step: { ...step },
              stepIndex,
              reason: finalResult?.error ?? "This browser action requires human approval.",
              results,
              history
            });
            renderControlMonitor();
          }
          const archiveResult = await saveControlReportToArchive(results, finalResult?.approvalRequired ? "approval-required" : "blocked");
          if (archiveResult?.path) {
            const artifacts = [...(getCurrentControlRun()?.artifacts ?? []), { type: "archive-intake", path: archiveResult.path }];
            updateControlRunArtifacts(artifacts);
            renderControlMonitor();
            await updateBrowserJob(getCurrentControlRun()?.id, { artifacts });
          }
          return { ok: false, results, approvalRequired: Boolean(finalResult?.approvalRequired) };
        }
        updateControlStep(stepIndex, "completed", consent ? `trusted task consent · ${controlResultSummary(finalResult)}` : controlResultSummary(finalResult), {
          phase: "verified",
          observation: {
            title: verificationSnapshot?.title ?? getLastSnapshot()?.title ?? snapshot?.title ?? null,
            url: verificationSnapshot?.url ?? getLastSnapshot()?.url ?? snapshot?.url ?? null
          },
          decision: decision.thought ?? null,
          action: controlStepLabel(finalStep),
          result: controlResultSummary(finalResult),
          safetyClass: boundary,
          ...controlStepEvidence({
            boundary,
            decision,
            result: finalResult
          }),
          uncertainty: finalVerification.uncertainty ?? null
        });
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

  async function runControlCommand(body, options = {}) {
    const goal = String(body ?? "").trim();
    if (!goal) {
      await addMessage("system", "Use `/control <browser goal>` or ask Augmentor to operate the current page.");
      return;
    }
    const resumedFromJob = options?.resumedFromJob ?? null;
    const seededHistory = browserJobStepHistory(resumedFromJob);
    const continuationPrefix = resumedFromJob?.id ? `Continuation of ${resumedFromJob.id}. ` : "";
    setStatus("Taking control");
    setActivity("tool-running", "Agent Control Mode", goal);
    const job = await createBrowserJob({
      existingJob: resumedFromJob,
      goal,
      planner: "observe-act-verify-loop",
      summary: `${continuationPrefix}Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing.`
    });
    startControlRun({
      goal,
      plan: {
        source: "observe-act-verify-loop",
        summary: `${continuationPrefix}Adaptive browser-agent loop. The host observes the page, asks for one safe next action, executes it, then verifies before continuing.`,
        pageLock: job.pageLock ?? null,
        steps: Array.isArray(resumedFromJob?.steps) ? resumedFromJob.steps : [],
        artifacts: Array.isArray(resumedFromJob?.artifacts) ? resumedFromJob.artifacts : []
      }
    });
    await addMessage(
      "system",
      [
        resumedFromJob ? "Agent Control Mode continued." : "Agent Control Mode started.",
        `Job: ${job.id}`,
        ...(resumedFromJob ? [`Resumed same durable job: ${resumedFromJob.id}`, `Previous steps loaded: ${seededHistory.length}`] : []),
        `Goal: ${goal}`,
        "Mode: observe -> decide -> act -> verify.",
        "",
        "Approval boundary: wallet, login, payment, credential, public submit, and destructive actions remain blocked unless a human approval flow authorizes them."
      ].join("\n")
    );
    return continueControlLoop({
      goal,
      history: seededHistory,
      results: [],
      startIndex: seededHistory.length,
      maxSteps: Math.max(12, seededHistory.length + 8)
    });
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
    updateControlStep(approval.stepIndex, "active", "approved once", {
      phase: "acting",
      decision: "Human approved this action once.",
      action: controlStepLabel(step),
      safetyClass: approvalBoundaryForStep(step),
      confidence: "medium",
      uncertainty: "Human approval was required before this step could run."
    });
    const result = await executeControlStep(step);
    results.push({ step, result });
    if (!result?.ok) {
      updateControlStep(approval.stepIndex, result?.approvalRequired ? "blocked" : "failed", controlResultSummary(result), {
        phase: result?.approvalRequired ? "waiting-for-human" : "blocked",
        observation: {
          title: getLastSnapshot()?.title ?? null,
          url: getLastSnapshot()?.url ?? null
        },
        decision: "Human approved this action once, but the host still could not complete it safely.",
        action: controlStepLabel(step),
        result: controlResultSummary(result),
        safetyClass: approvalBoundaryForStep(step, result?.error),
        ...controlStepEvidence({
          boundary: approvalBoundaryForStep(step, result?.error),
          decision: { uncertainty: "The approved browser action did not complete safely." },
          result,
          status: result?.approvalRequired ? "approval" : "blocked"
        })
      });
      finishControlRun(result?.approvalRequired ? "approval" : "blocked");
      setStatus(result?.approvalRequired ? "Needs approval" : "Control blocked");
      setActivity("failed", "Control mode blocked", controlStepLabel(step));
      await addMessage("system", `Agent Control Mode blocked after approval: ${controlStepLabel(step)}\n${result?.error ?? "unknown error"}`);
      await saveControlReportToArchive(results, result?.approvalRequired ? "approval-required" : "blocked");
      return;
    }
    updateControlStep(approval.stepIndex, "completed", controlResultSummary(result), {
      phase: "verified",
      observation: {
        title: getLastSnapshot()?.title ?? null,
        url: getLastSnapshot()?.url ?? null
      },
      decision: "Human approved this action once.",
      action: controlStepLabel(step),
      result: controlResultSummary(result),
      safetyClass: approvalBoundaryForStep(step, result?.error),
      confidence: "medium",
      uncertainty: "Human approval was used for this completed action."
    });
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
    updateControlStep(denied.stepIndex, "blocked", "denied by human", {
      phase: "blocked",
      decision: "Human denied this browser action.",
      action: controlStepLabel(denied.step),
      result: "denied by human",
      safetyClass: approvalBoundaryForStep(denied.step, denied.reason),
      confidence: "high",
      uncertainty: denied.reason ?? "Human denied the proposed action.",
      nextHumanAction: "Revise the task, choose a safer target, or perform the denied action manually."
    });
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
