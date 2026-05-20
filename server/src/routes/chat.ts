/**
 * Chat completions proxy — POST /chat/completions
 * Validates auth, enforces rate limits, proxies to OpenAI server-side.
 */
import { Router, type Request, type Response } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { checkDailyLimit } from "../middleware/rateLimitUser";
import { proxyChatCompletion, proxyChatCompletionStream } from "../services/openaiProxy";
import type { AuthenticatedRequest, ChatCompletionRequest } from "../types";

const router = Router();

const MessageSchema = z.object({
  role: z.enum(["system", "user", "assistant"]),
  content: z.string(),
});

const ChatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z.array(MessageSchema).min(1),
  stream: z.boolean().optional(),
  max_tokens: z.number().int().positive().optional(),
  temperature: z.number().min(0).max(2).optional(),
});

// ─── POST /chat/completions ───────────────────────────────────────────────────

router.post(
  "/completions",
  requireAuth,
  checkDailyLimit,
  async (req: Request, res: Response) => {
    const authReq = req as AuthenticatedRequest;

    const parse = ChatRequestSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: parse.error.errors[0]?.message ?? "Invalid request body",
      });
      return;
    }

    const body = parse.data as ChatCompletionRequest;

    // Merge any extra fields from request body (e.g. function_call, tools)
    // but explicitly strip api_key fields from the merge
    const mergedBody: ChatCompletionRequest = {
      ...req.body as Record<string, unknown>,
      model: body.model,
      messages: body.messages,
      stream: body.stream,
      max_tokens: body.max_tokens,
    };
    // Security: strip any client-supplied API key
    delete (mergedBody as Record<string, unknown>)["api_key"];
    delete (mergedBody as Record<string, unknown>)["apiKey"];

    const endpoint = "/chat/completions";

    if (body.stream) {
      await proxyChatCompletionStream({
        userId: authReq.user.id,
        body: mergedBody,
        res,
        endpoint,
      });
    } else {
      await proxyChatCompletion({
        userId: authReq.user.id,
        body: mergedBody,
        res,
        endpoint,
      });
    }
  }
);

export default router;
