export function normalizedRailQuery(value) {
  return String(value ?? "").replace(/\s+/g, " ").trim().toLowerCase();
}

export function railSearchMatchesSession(session, query) {
  const normalized = normalizedRailQuery(query);
  if (!normalized) return true;
  const haystack = [
    session?.title,
    session?.workspaceId,
    ...(Array.isArray(session?.messages) ? session.messages.map((message) => message.content) : [])
  ].join(" ").toLowerCase();
  return haystack.includes(normalized);
}

export function railSearchMatchesProject(project, projectSessions = [], query = "") {
  const normalized = normalizedRailQuery(query);
  if (!normalized) return true;
  const projectHaystack = [project?.name, project?.id].join(" ").toLowerCase();
  return projectHaystack.includes(normalized) || projectSessions.some((session) => railSearchMatchesSession(session, normalized));
}
