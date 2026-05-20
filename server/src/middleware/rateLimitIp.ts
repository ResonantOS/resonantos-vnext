/**
 * IP-based rate limiters for auth endpoints.
 */
import rateLimit from "express-rate-limit";

/** 5 requests per 15 minutes — for /auth/register */
export const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many registration attempts. Please try again in 15 minutes." },
  skipSuccessfulRequests: false,
});

/** 10 requests per minute — for /auth/login */
export const loginLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please slow down." },
  skipSuccessfulRequests: false,
});

/** General API limiter — 200 req/min */
export const apiLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please slow down." },
});
