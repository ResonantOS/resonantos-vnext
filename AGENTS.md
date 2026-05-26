# ResonantOS vNext Agent Instructions

## Git Workflow

- Active development happens on `dev`.
- Codex must commit to `dev` by default.
- `main` is the stable preview/release branch.
- Do not commit directly to `main` unless the user explicitly instructs it.
- Merge or PR `dev` into `main` only after deterministic validation.
- Before committing, confirm the current branch with `git status --short --branch`.

## Validation

- Run deterministic checks before calling implementation work done.
- For TypeScript/UI changes, run `npm test -- --run` and `npm run build`.
- For Rust/Tauri host changes, run `cargo fmt --check && cargo test` from `src-tauri`.
- For alpha packaging changes, run `npm run tauri:build`.

## Local Model Engineering Loop

- Treat local Qwen/OpenCode/Hermes coding output as an implementation draft until reviewed.
- For non-trivial code, config, infrastructure, provider, credential, CLI, persistence, or test changes, use this loop by default: implement pass, adversarial review pass, narrow fix pass, deterministic verification pass.
- The review pass must first trace implementation and tests against every explicit user requirement; self-written tests are not proof of correctness. Then check for instruction drift, scope creep, hidden side effects, tests that pass for the wrong reason, secret exposure, brittle parsing, and unrequested model/provider routing changes.
- The verification pass must include direct spot checks for every accepted input category or externally visible mode requested by the user, not only the tests created during implementation.
- If an allowed file or directory set is provided, do not edit outside it. If no boundary is provided, infer the smallest safe write set and report it.
- Do not call the work done unless the review and verification passes are complete, or explicitly label the result as code-reviewed/needs testing with residual risk.
