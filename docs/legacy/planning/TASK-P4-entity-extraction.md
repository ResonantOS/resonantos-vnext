# Task P4: Named Entity Extraction During Archive Ingest

## Context
Living Archive pages have no structured entity metadata. During ingest/AI Memory builds, the system should extract named entities (people, places, organizations, concepts, dates) and store them for entity-based queries.

## Current Implementation
- Pages are written via `write_archive_intake_artifact()` at line 2543
- Pages have: id, type, title, file_path, stage, updated, content
- No entity/metadata table exists
- Ingest pipeline processes through review artifacts

## Specification

### 1. Rust: Add entities table to wiki.db
In `archive_service.rs`, in the DB initialization code, add:
```sql
CREATE TABLE IF NOT EXISTS page_entities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    page_id TEXT NOT NULL REFERENCES pages(id),
    entity_type TEXT NOT NULL,
    entity_value TEXT NOT NULL,
    confidence REAL NOT NULL DEFAULT 1.0,
    context_snippet TEXT,
    extracted_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_page_entities_type ON page_entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_page_entities_value ON page_entities(entity_value);
CREATE INDEX IF NOT EXISTS idx_page_entities_page ON page_entities(page_id);
```

Entity types: "person", "organization", "location", "concept", "date", "technology", "project"

### 2. Rust: Add rule-based entity extraction
Add `extract_entities_from_content(content: &str) -> Vec<PageEntity>`:
- Use pattern matching for common entity types:
  - **Dates:** regex for YYYY-MM-DD, "Month Day, Year", relative dates
  - **Technologies:** match against known tech terms (Rust, Python, TypeScript, SQLite, Tauri, React, etc.)
  - **Projects:** match against known project names (ResonantOS, Living Archive, etc.)
  - **People:** Capitalize word patterns (2+ capitalized words in sequence, excluding sentence starts)
- Return Vec of `PageEntity { entity_type, entity_value, confidence, context_snippet }`
- This is a V1 heuristic approach; LLM-based extraction can be added later

### 3. Rust: Store entities on page write
After a page is written/updated, call `extract_entities_from_content()` and INSERT results into `page_entities`. Clear old entities for the page first (DELETE WHERE page_id = ?).

### 4. Rust: Add entity search function
Add `search_archive_entities(entity_type: Option<&str>, query: &str, limit: usize) -> Vec<EntitySearchResult>`:
```rust
struct EntitySearchResult {
    entity_type: String,
    entity_value: String,
    page_count: i64,
    pages: Vec<(String, String)>, // (page_id, title)
}
```
Query: `SELECT entity_type, entity_value, COUNT(DISTINCT page_id) as page_count FROM page_entities WHERE entity_value LIKE ? GROUP BY entity_type, entity_value ORDER BY page_count DESC LIMIT ?`

### 5. TS: Add entity types
In `src/core/contracts.ts`, add:
```typescript
export interface PageEntity {
  entityType: string;
  entityValue: string;
  confidence: number;
  contextSnippet?: string;
}
export interface EntitySearchResult {
  entityType: string;
  entityValue: string;
  pageCount: number;
  pages: { pageId: string; title: string }[];
}
```

### 6. Tests
Rust tests:
- Test date extraction from "Meeting on 2026-05-09"
- Test technology extraction from "Built with Rust and React"
- Test person extraction from "Tom Pennington discussed the design"
- Test entities are stored and retrieved correctly
- Test entity search returns grouped results

## Test Command
```bash
cd ~/resonantos-vnext && cargo test --lib
```

## Scope
- Primary: `src-tauri/src/archive_service.rs` (~200 lines added)
- Secondary: `src/core/contracts.ts` (~20 lines added)
