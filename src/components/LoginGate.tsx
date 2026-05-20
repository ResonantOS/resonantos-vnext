/**
 * LoginGate — Auth wall for web/cloud deployments.
 * Replaces the old token-only TokenGate with a proper login + register flow.
 * Shows when VITE_API_BASE is set (web mode) and no valid token is stored.
 */
import type { KeyboardEvent } from "react";
import { useState } from "react";
import { setWebAuthToken } from "../core/web-transport";

const API_BASE = import.meta.env.VITE_API_BASE as string | undefined;

interface LoginGateProps {
  onConnected: () => void;
}

type Tab = "signin" | "register";

function validateEmail(email: string): string | null {
  if (!email.trim()) return "Email is required";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return "Enter a valid email address";
  return null;
}

function validatePassword(password: string): string | null {
  if (!password) return "Password is required";
  if (password.length < 8) return "Password must be at least 8 characters";
  return null;
}

export function LoginGate({ onConnected }: LoginGateProps) {
  const [tab, setTab] = useState<Tab>("signin");

  // Sign in state
  const [signinEmail, setSigninEmail] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinShowPassword, setSigninShowPassword] = useState(false);
  const [signinError, setSigninError] = useState<string | null>(null);
  const [signinBusy, setSigninBusy] = useState(false);

  // Register state
  const [regEmail, setRegEmail] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regInvite, setRegInvite] = useState("");
  const [regShowPassword, setRegShowPassword] = useState(false);
  const [regEmailError, setRegEmailError] = useState<string | null>(null);
  const [regPasswordError, setRegPasswordError] = useState<string | null>(null);
  const [regInviteError, setRegInviteError] = useState<string | null>(null);
  const [regError, setRegError] = useState<string | null>(null);
  const [regBusy, setRegBusy] = useState(false);

  // ─── Sign In ─────────────────────────────────────────────────────────────

  const handleSignIn = async () => {
    setSigninError(null);
    if (!signinEmail.trim() || !signinPassword) {
      setSigninError("Please enter your email and password.");
      return;
    }
    setSigninBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: signinEmail.trim(), password: signinPassword }),
      });

      if (res.status === 401) {
        setSigninError("Invalid email or password. Please try again.");
        return;
      }
      if (res.status === 429) {
        const data = await res.json() as { error?: string; retry_after?: number };
        setSigninError(data.error ?? "Too many attempts. Please try again later.");
        return;
      }
      if (!res.ok) {
        if (!navigator.onLine || res.status === 0) {
          setSigninError("Connection failed. Check your network and try again.");
        } else {
          setSigninError(`Service error (${res.status}). Please try again.`);
        }
        return;
      }

      const data = await res.json() as { token: string };
      localStorage.setItem("ros_api_token", data.token);
      setWebAuthToken(data.token);
      onConnected();
    } catch {
      setSigninError("Connection failed. Check your network and try again.");
    } finally {
      setSigninBusy(false);
    }
  };

  const handleSignInKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") void handleSignIn();
  };

  // ─── Register ─────────────────────────────────────────────────────────────

  const handleRegister = async () => {
    // Client-side validation
    const emailErr = validateEmail(regEmail);
    const passwordErr = validatePassword(regPassword);
    const inviteErr = !regInvite.trim() ? "Invite code is required" : null;

    setRegEmailError(emailErr);
    setRegPasswordError(passwordErr);
    setRegInviteError(inviteErr);
    setRegError(null);

    if (emailErr || passwordErr || inviteErr) return;

    setRegBusy(true);
    try {
      const res = await fetch(`${API_BASE}/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: regEmail.trim(),
          password: regPassword,
          invite_code: regInvite.trim().toUpperCase(),
        }),
      });

      if (res.status === 409) {
        setRegEmailError("This email is already registered. Try signing in.");
        return;
      }
      if (res.status === 422) {
        const data = await res.json() as { error?: string };
        setRegInviteError(data.error ?? "Invalid invite code.");
        return;
      }
      if (res.status === 400) {
        const data = await res.json() as { error?: string };
        setRegError(data.error ?? "Invalid request. Please check your details.");
        return;
      }
      if (!res.ok) {
        if (!navigator.onLine || res.status === 0) {
          setRegError("Connection failed. Check your network and try again.");
        } else {
          setRegError(`Service error (${res.status}). Please try again.`);
        }
        return;
      }

      const data = await res.json() as { token: string };
      localStorage.setItem("ros_api_token", data.token);
      setWebAuthToken(data.token);
      onConnected();
    } catch {
      setRegError("Connection failed. Check your network and try again.");
    } finally {
      setRegBusy(false);
    }
  };

  const handleRegisterKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter") void handleRegister();
  };

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="token-gate-backdrop">
      <div className="token-gate-card login-gate-card">
        <span className="eyebrow">ResonantOS Cloud</span>
        <h1>Welcome to Augmentor</h1>

        {/* Tabs */}
        <div className="auth-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "signin"}
            className={`auth-tab-btn ${tab === "signin" ? "active" : ""}`}
            onClick={() => {
              setTab("signin");
              setSigninError(null);
            }}
          >
            Sign In
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "register"}
            className={`auth-tab-btn ${tab === "register" ? "active" : ""}`}
            onClick={() => {
              setTab("register");
              setRegError(null);
            }}
          >
            Register
          </button>
        </div>

        {/* Sign In Form */}
        {tab === "signin" && (
          <div className="token-gate-form auth-form">
            <div className="auth-field-group">
              <label htmlFor="signin-email">Email</label>
              <input
                id="signin-email"
                type="email"
                className="token-gate-input"
                placeholder="you@example.com"
                value={signinEmail}
                onChange={(e) => {
                  setSigninEmail(e.target.value);
                  setSigninError(null);
                }}
                onKeyDown={handleSignInKeyDown}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                disabled={signinBusy}
                autoComplete="email"
              />
            </div>

            <div className="auth-field-group">
              <label htmlFor="signin-password">Password</label>
              <div className="auth-password-wrapper">
                <input
                  id="signin-password"
                  type={signinShowPassword ? "text" : "password"}
                  className="token-gate-input"
                  placeholder="Password"
                  value={signinPassword}
                  onChange={(e) => {
                    setSigninPassword(e.target.value);
                    setSigninError(null);
                  }}
                  onKeyDown={handleSignInKeyDown}
                  disabled={signinBusy}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setSigninShowPassword((v) => !v)}
                  aria-label={signinShowPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {signinShowPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {signinError && <p className="token-gate-error auth-field-error">{signinError}</p>}

            <button
              type="button"
              className="button-primary touch-action"
              onClick={() => void handleSignIn()}
              disabled={signinBusy || !signinEmail.trim() || !signinPassword}
            >
              {signinBusy ? "Signing in…" : "Sign In"}
            </button>

            <p className="auth-footer-link">
              Need an account?{" "}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => setTab("register")}
              >
                Register with an invite code
              </button>
            </p>
          </div>
        )}

        {/* Register Form */}
        {tab === "register" && (
          <div className="token-gate-form auth-form">
            <div className="auth-field-group">
              <label htmlFor="reg-email">Email</label>
              <input
                id="reg-email"
                type="email"
                className={`token-gate-input ${regEmailError ? "input-error" : ""}`}
                placeholder="you@example.com"
                value={regEmail}
                onChange={(e) => {
                  setRegEmail(e.target.value);
                  setRegEmailError(null);
                }}
                onKeyDown={handleRegisterKeyDown}
                // eslint-disable-next-line jsx-a11y/no-autofocus
                autoFocus
                disabled={regBusy}
                autoComplete="email"
              />
              {regEmailError && <span className="auth-field-error">{regEmailError}</span>}
            </div>

            <div className="auth-field-group">
              <label htmlFor="reg-password">Password</label>
              <div className="auth-password-wrapper">
                <input
                  id="reg-password"
                  type={regShowPassword ? "text" : "password"}
                  className={`token-gate-input ${regPasswordError ? "input-error" : ""}`}
                  placeholder="At least 8 characters"
                  value={regPassword}
                  onChange={(e) => {
                    setRegPassword(e.target.value);
                    setRegPasswordError(null);
                  }}
                  onKeyDown={handleRegisterKeyDown}
                  disabled={regBusy}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="auth-toggle-password"
                  onClick={() => setRegShowPassword((v) => !v)}
                  aria-label={regShowPassword ? "Hide password" : "Show password"}
                  tabIndex={-1}
                >
                  {regShowPassword ? "Hide" : "Show"}
                </button>
              </div>
              {regPasswordError && <span className="auth-field-error">{regPasswordError}</span>}
            </div>

            <div className="auth-field-group">
              <label htmlFor="reg-invite">Invite Code</label>
              <input
                id="reg-invite"
                type="text"
                className={`token-gate-input ${regInviteError ? "input-error" : ""}`}
                placeholder="XXXXXXXXXXXX"
                value={regInvite}
                onChange={(e) => {
                  setRegInvite(e.target.value.toUpperCase());
                  setRegInviteError(null);
                }}
                onKeyDown={handleRegisterKeyDown}
                disabled={regBusy}
                autoComplete="off"
                spellCheck={false}
              />
              {regInviteError ? (
                <span className="auth-field-error">{regInviteError}</span>
              ) : (
                <span className="invite-hint">Enter the invite code you received to create an account.</span>
              )}
            </div>

            {regError && <p className="token-gate-error auth-field-error">{regError}</p>}

            <button
              type="button"
              className="button-primary touch-action"
              onClick={() => void handleRegister()}
              disabled={regBusy || !regEmail.trim() || !regPassword || !regInvite.trim()}
            >
              {regBusy ? "Creating account…" : "Create Account"}
            </button>

            <p className="auth-footer-link">
              Already have an account?{" "}
              <button
                type="button"
                className="auth-link-btn"
                onClick={() => setTab("signin")}
              >
                Sign in
              </button>
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
