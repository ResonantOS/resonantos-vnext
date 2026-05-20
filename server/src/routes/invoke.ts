/**
 * Invoke bridge — POST /invoke/:command
 * Validates auth on every call. Command registry pattern for extensibility.
 */
import { Router, type Request, type Response } from "express";
import { requireAuth } from "../middleware/auth";
import type { AuthenticatedRequest, AuthUser } from "../types";

const router = Router();

// ─── Command Registry ─────────────────────────────────────────────────────────

type InvokeHandler = (args: unknown, user: AuthUser) => Promise<unknown>;

const COMMAND_REGISTRY = new Map<string, InvokeHandler>([
  [
    "local_runtime_status",
    async () => ({
      ok: true,
      mode: "web",
      version: "0.1.0",
    }),
  ],
  [
    "provider_smoke_test",
    async (_args, user) => ({
      ok: true,
      user_id: user.id,
    }),
  ],
]);

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/:command", requireAuth, async (req: Request, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { command } = req.params;
  const handler = COMMAND_REGISTRY.get(command!);

  if (!handler) {
    res.status(501).json({ error: `Unknown command: ${command}` });
    return;
  }

  try {
    const result = await handler(req.body, authReq.user);
    res.json(result);
  } catch (err) {
    const appErr = err as { status?: number; message: string };
    if (appErr.status) {
      res.status(appErr.status).json({ error: appErr.message });
      return;
    }
    throw err;
  }
});

export default router;
