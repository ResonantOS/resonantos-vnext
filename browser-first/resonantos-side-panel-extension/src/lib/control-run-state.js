export function createControlRunState({
  browserJobStore,
  getCurrentControlRun,
  renderControlMonitor,
  setCurrentControlRun,
  setPageControlOverlay,
  setPendingApproval,
  updateBrowserJob
}) {
  const startControlRun = ({ goal, plan }) => {
    const run = {
      id: browserJobStore.getActiveJobId() ?? `control-${Date.now()}`,
      goal,
      planner: plan.source,
      summary: plan.summary,
      status: "running",
      steps: plan.steps.map((step) => ({ ...step, state: "pending" })),
      artifacts: [],
      startedAt: new Date().toISOString(),
      completedAt: null
    };
    setCurrentControlRun(run);
    setPendingApproval(null);
    renderControlMonitor();
    void setPageControlOverlay(true, `Augmentor operating: ${goal}`, "working");
    return run;
  };

  const updateControlStep = (index, state, note = "") => {
    const currentControlRun = getCurrentControlRun();
    if (!currentControlRun?.steps[index]) return;
    const steps = [...currentControlRun.steps];
    steps[index] = { ...steps[index], state, note };
    setCurrentControlRun({ ...currentControlRun, steps });
    renderControlMonitor();
  };

  const appendControlStep = (step) => {
    const currentControlRun = getCurrentControlRun();
    if (!currentControlRun) return -1;
    const index = currentControlRun.steps.length;
    setCurrentControlRun({
      ...currentControlRun,
      steps: [...currentControlRun.steps, { ...step, state: "pending" }]
    });
    renderControlMonitor();
    return index;
  };

  const updateControlRunArtifacts = (artifacts) => {
    const currentControlRun = getCurrentControlRun();
    if (!currentControlRun) return;
    setCurrentControlRun({ ...currentControlRun, artifacts });
  };

  const finishControlRun = (status, artifact = null) => {
    const currentControlRun = getCurrentControlRun();
    if (!currentControlRun) return;
    const completedRun = {
      ...currentControlRun,
      status,
      completedAt: new Date().toISOString(),
      artifacts: artifact ? [...currentControlRun.artifacts, artifact] : currentControlRun.artifacts
    };
    setCurrentControlRun(completedRun);
    renderControlMonitor();
    void setPageControlOverlay(false, "", "returning");
    void updateBrowserJob(completedRun.id, {
      status,
      artifacts: completedRun.artifacts,
      summary: completedRun.summary,
      planner: completedRun.planner,
      steps: completedRun.steps
    });
  };

  return {
    appendControlStep,
    finishControlRun,
    startControlRun,
    updateControlRunArtifacts,
    updateControlStep
  };
}
