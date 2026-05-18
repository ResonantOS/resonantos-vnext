# Task P1: Vector Embeddings for Living Archive Semantic Search

## Context
The Living Archive's `search_archive()` in `src-tauri/src/archive_service.rs` (line 2403) uses SQL `LIKE` matching only. This limits search quality to exact substring matches. We need semantic/vector search using embeddings.

## Current Implementation
- `search_archive()` at line 2403 does `WHERE title LIKE ?1 OR content LIKE ?1`
- Results scored: title_match=1.0, content_match=0.25
- SQLite wiki.db has tables: pages (id, type, title, file_path, stage, updated, content), sources, links, activity_log
- TS types in `src/core/contracts.ts` line 847: `ArchiveSearchPageHit` has score field

## Specification

### 1. Rust: Add embeddings table to wiki.db schema
In `archive_service.rs`, find the DB initialization/migration code and add:
```sql
CREATE TABLE IF NOT EXISTS page_embeddings (
    page_id TEXT PRIMARY KEY REFERENCES pages(id),
    embedding BLOB NOT NULL,
    model TEXT NOT NULL,
    dimensions INTEGER NOT NULL,
    updated_at TEXT NOT NULL
);
```

### 2. Rust: Add embedding generation helper
Add a function `generate_embedding()` that calls the provider service to create an embedding for text content. Use the existing `execute_provider_service_chat` pattern from `crate::provider_service` but for embeddings. If the provider doesn't support embeddings, fall back to a simple TF-IDF vector (bag of words with frequency weighting).

For the V1 implementation, use a **local TF-IDF approach** (no external API dependency):
- Tokenize content into words
- Build term frequency vector
- Normalize to unit length
- Store as binary blob (f32 array)
- This gives us the infrastructure; LLM-based embeddings can be swapped in later

### 3. Rust: Add cosine similarity search
Add `search_archive_semantic()`:
- Takes query text, generates its TF-IDF vector
- Loads page_embeddings from SQLite
- Computes cosine similarity between query vector and each page vector
- Returns top-N results sorted by similarity score
- Merge with existing LIKE results in `search_archive()` (semantic results get score boost)

### 4. Rust: Add embedding generation during page writes
After a page is written/updated in the wiki (look for INSERT/UPDATE on pages table), generate and store its embedding in page_embeddings.

### 5. TS: Add semantic search indicator
In `src/core/contracts.ts`, add `semanticScore?: number` to `ArchiveSearchPageHit` interface.

### 6. Tests
Add Rust tests in the `#[cfg(test)] mod tests` block at line 3188:
- Test TF-IDF vector generation produces non-zero vectors
- Test cosine similarity returns 1.0 for identical vectors, 0.0 for orthogonal
- Test search_archive_semantic returns relevant results
- Test embeddings table is created during DB init

## Test Command
```bash
cd ~/resonantos-vnext && cargo test --lib
```

## Scope
- Primary: `src-tauri/src/archive_service.rs` (add ~200 lines)
- Secondary: `src/core/contracts.ts` (add 1 field)
- Max 2 files changed
