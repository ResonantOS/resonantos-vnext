const TERMINAL_JOB_STATUSES = ["completed", "blocked", "denied", "cancelled", "failed"];
const ACTIVE_JOB_STATUSES = ["queued", "running", "paused", "approval"];
const VALID_JOB_STATUSES = [...ACTIVE_JOB_STATUSES, ...TERMINAL_JOB_STATUSES];

const defaultNow = () => new Date().toISOString();
const defaultId = () => `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

function normalizeStepDetails(details) {
  if (!details || typeof details !== "object") return {};
  return {
    phase: details.phase ? String(details.phase).slice(0, 80) : null,
    observation: details.observation && typeof details.observation === "object"
      ? {
        title: details.observation.title ? String(details.observation.title).slice(0, 180) : null,
        url: details.observation.url ? String(details.observation.url).slice(0, 240) : null
      }
      : null,
    decision: details.decision ? String(details.decision).slice(0, 500) : null,
    action: details.action ? String(details.action).slice(0, 120) : null,
    result: details.result ? String(details.result).slice(0, 500) : null,
    safetyClass: details.safetyClass ? String(details.safetyClass).slice(0, 80) : null
  };
}

export function normalizeBrowserJob(job, { now = defaultNow } = {}) {
  const steps = Array.isArray(job?.steps)
    ? job.steps.slice(0, 30).map((step) => ({
      type: String(step?.type ?? "step").slice(0, 80),
      label: String(step?.label ?? step?.text ?? step?.url ?? step?.query ?? step?.type ?? "step").slice(0, 180),
      state: String(step?.state ?? "pending").slice(0, 40),
      note: String(step?.note ?? "").slice(0, 240),
      details: normalizeStepDetails(step?.details),
      updatedAt: step?.updatedAt ? String(step.updatedAt).slice(0, 40) : null
    }))
    : [];
  return {
    id: String(job?.id ?? `job-${Date.now()}`),
    goal: String(job?.goal ?? "Browser job").slice(0, 300),
    status: VALID_JOB_STATUSES.includes(job?.status) ? job.status : "queued",
    createdAt: job?.createdAt ?? now(),
    updatedAt: job?.updatedAt ?? now(),
    completedAt: job?.completedAt ?? null,
    planner: String(job?.planner ?? "observe-act-verify-loop").slice(0, 120),
    summary: String(job?.summary ?? "").slice(0, 700),
    artifacts: Array.isArray(job?.artifacts) ? job.artifacts.slice(0, 20) : [],
    lastError: job?.lastError ? String(job.lastError).slice(0, 700) : null,
    steps
  };
}

export function isTerminalBrowserJobStatus(status) {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export function isActiveBrowserJobStatus(status) {
  return ACTIVE_JOB_STATUSES.includes(status);
}

export function createBrowserJobStore({
  storage,
  storageKeys,
  maxJobs = 40,
  now = defaultNow,
  createId = defaultId
}) {
  let jobs = [];
  let activeJobId = null;
  let monitorCollapsed = true;

  function compact(nextJobs = jobs) {
    jobs = nextJobs
      .map((job) => normalizeBrowserJob(job, { now }))
      .sort((left, right) => String(right.updatedAt).localeCompare(String(left.updatedAt)))
      .slice(0, maxJobs);
    if (activeJobId && !jobs.some((job) => job.id === activeJobId)) {
      activeJobId = null;
    }
    return jobs;
  }

  async function persist() {
    compact();
    await storage?.set?.({
      [storageKeys.activeBrowserJob]: activeJobId,
      [storageKeys.browserJobs]: jobs,
      [storageKeys.jobMonitorCollapsed]: monitorCollapsed
    }).catch(() => undefined);
    return snapshot();
  }

  async function hydrate() {
    const stored = await storage?.get?.([
      storageKeys.browserJobs,
      storageKeys.activeBrowserJob,
      storageKeys.jobMonitorCollapsed
    ]).catch(() => ({}));
    jobs = Array.isArray(stored?.[storageKeys.browserJobs])
      ? stored[storageKeys.browserJobs].map((job) => normalizeBrowserJob(job, { now }))
      : [];
    monitorCollapsed = typeof stored?.[storageKeys.jobMonitorCollapsed] === "boolean"
      ? stored[storageKeys.jobMonitorCollapsed]
      : true;
    compact();
    const storedActiveJobId = String(stored?.[storageKeys.activeBrowserJob] ?? "");
    activeJobId = jobs.some((job) => job.id === storedActiveJobId)
      ? storedActiveJobId
      : jobs.find((job) => isActiveBrowserJobStatus(job.status))?.id ?? null;
    return snapshot();
  }

  function snapshot() {
    return {
      activeJobId,
      jobs,
      monitorCollapsed
    };
  }

  function getJobs() {
    return jobs;
  }

  function getActiveJobId() {
    return activeJobId;
  }

  function getMonitorCollapsed() {
    return monitorCollapsed;
  }

  function currentJob() {
    return jobs.find((job) => job.id === activeJobId) ?? null;
  }

  function findJob(idOrGoal = "") {
    const needle = String(idOrGoal ?? "").trim().toLowerCase();
    if (!needle) return currentJob() ?? jobs[0] ?? null;
    return jobs.find((job) =>
      job.id.toLowerCase() === needle ||
      job.id.toLowerCase().includes(needle) ||
      job.goal.toLowerCase().includes(needle)
    ) ?? null;
  }

  async function createJob({ goal, planner = "observe-act-verify-loop", summary = "" }) {
    const job = normalizeBrowserJob({
      id: createId(),
      goal,
      planner,
      summary,
      status: "running",
      createdAt: now(),
      updatedAt: now()
    }, { now });
    jobs = compact([job, ...jobs.filter((item) => item.id !== job.id)]);
    activeJobId = job.id;
    await persist();
    return job;
  }

  async function updateJob(jobId, patch) {
    if (!jobId) return null;
    let updated = null;
    jobs = jobs.map((job) => {
      if (job.id !== jobId) return job;
      updated = normalizeBrowserJob({
        ...job,
        ...patch,
        updatedAt: now(),
        completedAt: patch.completedAt ?? (isTerminalBrowserJobStatus(patch.status) ? now() : job.completedAt)
      }, { now });
      return updated;
    });
    await persist();
    return updated;
  }

  async function activateJob(jobId) {
    const job = jobs.find((item) => item.id === jobId) ?? null;
    activeJobId = job?.id ?? null;
    await persist();
    return job;
  }

  async function recoverInterruptedJobs({ from = ["running"], to = "paused", reason = "Recovered after browser host reload" } = {}) {
    const interruptedStatuses = new Set(from);
    let recovered = [];
    jobs = jobs.map((job) => {
      if (!interruptedStatuses.has(job.status)) return job;
      const recoveredJob = normalizeBrowserJob({
        ...job,
        status: to,
        lastError: reason,
        updatedAt: now()
      }, { now });
      recovered = [...recovered, recoveredJob];
      return recoveredJob;
    });
    if (activeJobId && !jobs.some((job) => job.id === activeJobId && isActiveBrowserJobStatus(job.status))) {
      activeJobId = recovered[0]?.id ?? jobs.find((job) => isActiveBrowserJobStatus(job.status))?.id ?? null;
    }
    if (!activeJobId && recovered.length) {
      activeJobId = recovered[0].id;
    }
    if (recovered.length) {
      await persist();
    }
    return recovered;
  }

  async function setMonitorCollapsed(collapsed) {
    monitorCollapsed = Boolean(collapsed);
    await persist();
    return monitorCollapsed;
  }

  async function toggleMonitorCollapsed() {
    return setMonitorCollapsed(!monitorCollapsed);
  }

  return {
    activateJob,
    createJob,
    currentJob,
    findJob,
    getActiveJobId,
    getJobs,
    getMonitorCollapsed,
    hydrate,
    persist,
    recoverInterruptedJobs,
    setMonitorCollapsed,
    snapshot,
    toggleMonitorCollapsed,
    updateJob
  };
}
