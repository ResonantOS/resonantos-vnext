# Task P3: Archive Performance Monitoring

## Context
Living Archive has no performance metrics. As the archive grows, query latency, ingest throughput, and wiki.db size need visibility. This adds timing instrumentation to the Rust archive service and exposes metrics through the existing IPC pattern.

## Current Implementation
- `archive_service.rs` has functions like `search_archive()`, `read_archive_document()`, `write_archive_intake_artifact()`, `queue_archive_ingest_request()`
- No timing or metrics currently
- TS side has `requestArchiveRuntimeStatus()` in `src/core/runtime.ts` that calls Tauri IPC

## Specification

### 1. Rust: Add ArchiveMetrics struct
In `archive_service.rs`, add:
```rust
#[derive(Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub(crate) struct ArchiveMetrics {
    pub(crate) db_size_bytes: u64,
    pub(crate) pages_total: i64,
    pub(crate) sources_total: i64,
    pub(crate) avg_search_ms: f64,
    pub(crate) avg_read_ms: f64,
    pub(crate) avg_write_ms: f64,
    pub(crate) searches_count: u64,
    pub(crate) reads_count: u64,
    pub(crate) writes_count: u64,
    pub(crate) last_search_ms: f64,
    pub(crate) last_read_ms: f64,
    pub(crate) last_write_ms: f64,
}
```

### 2. Rust: Add thread-safe metrics accumulator
Use `std::sync::Mutex<ArchiveMetrics>` as a lazy static (or `once_cell::sync::Lazy`) to track metrics across calls. Add helper functions:
```rust
fn record_metric(kind: &str, duration_ms: f64)
fn get_archive_metrics(app: &AppHandle) -> Result<ArchiveMetrics, String>
```

The `record_metric` function updates running averages and counts. `get_archive_metrics` also reads db file size and page/source counts from SQLite.

Note: `Cargo.toml` doesn't have `once_cell` — use `std::sync::OnceLock` (stable since Rust 1.70) or a simple `Mutex<Option<ArchiveMetrics>>` with `lazy_static` pattern via `std::sync::LazyLock` (stable Rust 1.80+, we're on 1.94.1).

### 3. Rust: Instrument key functions
Wrap timing around these functions using `std::time::Instant`:
- `search_archive()` — measure full search time
- `read_archive_document()` — measure read time
- `write_archive_intake_artifact()` — measure write time

Pattern:
```rust
let start = std::time::Instant::now();
// ... existing code ...
let elapsed = start.elapsed().as_secs_f64() * 1000.0;
record_metric("search", elapsed);
```

### 4. Rust: Register Tauri IPC command
Add a `#[tauri::command]` function `archive_metrics` that calls `get_archive_metrics()`. Register it in `main.rs` alongside existing archive commands.

### 5. TS: Add metrics types and request function
In `src/core/contracts.ts`, add `ArchiveMetrics` interface matching the Rust struct.
In `src/core/runtime.ts`, add `requestArchiveMetrics()` that invokes the `archive_metrics` Tauri command.

### 6. Tests
Rust tests:
- Test `record_metric` updates averages correctly
- Test `get_archive_metrics` returns valid struct with zeroes initially

TS tests (in `src/core/memory-provider.test.ts` or new file):
- Test ArchiveMetrics type shape exists

## Test Command
```bash
cd ~/resonantos-vnext && cargo test --lib && npm run test -- --run
```

## Scope
- `src-tauri/src/archive_service.rs` (~80 lines added)
- `src-tauri/src/main.rs` or `src-tauri/src/lib.rs` (1 line: register command)
- `src/core/contracts.ts` (add interface, ~15 lines)
- `src/core/runtime.ts` (add function, ~10 lines)
