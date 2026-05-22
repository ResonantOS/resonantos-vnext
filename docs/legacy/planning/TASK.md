# Task: Port Runtime Adapter Layer + Resolve Open Issues

## Context
Port the Runtime Adapter Layer (903 lines TypeScript) from the analog6 research repo into resonantos-vnext as production code. Also resolve 3 remaining open GitHub issues.

## Source Files (already written, copy + adapt)
- Source: `/Users/dr.tom/.openclaw/workspace/analog6/src/runtime-adapter/types.ts` (290 lines)
- Source: `/Users/dr.tom/.openclaw/workspace/analog6/src/runtime-adapter/native-adapter.ts` (340 lines)
- Source: `/Users/dr.tom/.openclaw/workspace/analog6/src/runtime-adapter/registry.ts` (225 lines)
- Source: `/Users/dr.tom/.openclaw/workspace/analog6/src/runtime-adapter/index.ts` (48 lines)

## Specification

### Part 1: Port Runtime Adapter into vNext

**Target directory:** `src/core/runtime-adapter/`

Copy the 4 source files into `src/core/runtime-adapter/`. The code is already clean TypeScript — no modifications needed to the core logic. But:

1. Copy all 4 files verbatim into `src/core/runtime-adapter/`
2. Add a barrel re-export in `src/core/runtime-adapter/index.ts` (already exists in source)
3. Write comprehensive tests in `src/core/runtime-adapter/runtime-adapter.test.ts` covering:
   - NativeRuntimeAdapter: connect/disconnect lifecycle, healthCheck always healthy, executeTool with the not-wired seam error, event emission (onEvent/offEvent), timeout handling, error classification (TRANSIENT/PERMANENT/SECURITY/RUNTIME_DOWN), retry logic with exponential backoff
   - RuntimeAdapterRegistryImpl: register/deregister, cannot deregister native, getAdapter tier-based routing with health fallback, getById throws on missing, listAdapters, refreshHealth, updateHealth, size/has helpers
4. Ensure all tests pass with `npx vitest run`
5. Do NOT modify `src/core/runtime.ts` — the adapter is a standalone module that will be wired later

### Part 2: Close Issue #6 — Dashboard icons not sizing correctly

Review `src/ui/icons/resonant-icons.tsx`. If icons have hardcoded dimensions or missing viewBox attributes, fix them. Icons should use `currentColor` for fill/stroke and accept className/size props for external sizing. Check App.test.tsx for any icon-related test assertions. If no actual bug is reproducible from the code, add a comment noting the fix and we'll close the issue.

### Part 3: Address Issue #11 — Missing tokio dependency

Check `src-tauri/Cargo.toml` for tokio dependency. If tokio is missing and the Rust code uses async/await (it uses Tauri 2 which requires tokio), verify the build compiles. If tokio is already pulled in transitively via tauri, document that in a comment. The issue may be stale — verify by running `cargo check` in `src-tauri/`.

### Part 4: Issue #10 — Runtime Adapter Layer

This issue requests exactly what Part 1 implements. After Part 1 is complete, this issue is resolved.

## Test Commands
```bash
cd /Users/dr.tom/resonantos-vnext
npx vitest run
# All tests must pass (currently 260, should be 260+ after new tests)
```

```bash
cd /Users/dr.tom/resonantos-vnext/src-tauri
cargo check 2>&1 | tail -5
# Must compile clean
```

## Scope
- 5 new files in `src/core/runtime-adapter/` (4 source + 1 test)
- Possible small fix in `src/ui/icons/resonant-icons.tsx`
- Possible Cargo.toml annotation
- No changes to existing `src/core/runtime.ts`

## IMPORTANT
- This goes to the community TOMORROW. Code must be clean, professional, well-documented.
- All existing 260 tests must continue passing.
- New tests must be thorough — this is a core infrastructure module.
- EXECUTE the plan. Do not just analyze it.
