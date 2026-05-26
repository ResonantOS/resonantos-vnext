# Audio2TOL Output Analysis For Living Archive Intake

Status: Working analysis  
Date: 2026-04-24

## Purpose

This document records the observed Audio2TOL output model used by the ResonantOS TOL intake bundle contract.

The goal is to avoid treating TOL as a generic markdown note. A high-quality TOL intake must preserve the full process chain:

- raw audio
- transcript
- protocol-guided analysis
- rendered TOL note
- processing metadata
- source/provenance links

## Sources Inspected

The analysis was based on a local Audio2TOL prototype, a local source vault, and representative generated TOL files. Concrete personal filesystem paths were removed from this alpha document because Audio2TOL is an optional add-on and those local paths are not product dependencies.

Reference categories:

- Audio2TOL MVP specification
- Audio2TOL Tauri UI and host implementation
- TOL analysis template
- vault notes describing Audio2TOL usage
- TOL protocol prompt
- raw audio folder
- generated transcript folder
- generated analysis folder
- vault map/config metadata
- representative sample output triplet:
  - `03_TOL/RAW Audio/<session>.mp3`
  - `03_TOL/TOL Transcripts/<session>_TOL_Transcript.md`
  - `03_TOL/TOL Analysis/<session>_TOL_Analysis.md`

## Observed Audio2TOL Pipeline

Audio2TOL is a Tauri desktop app with a local-first pipeline:

1. scan recorder/source folder for audio files
2. copy audio into a RAW Audio destination
3. transcribe imported audio with local `whisper.cpp`
4. run a selected LLM over the transcript with the TOL protocol
5. render an Obsidian markdown analysis note from the selected template
6. show file-by-file activity state in the UI

Current wired providers for analysis:

- Ollama
- MiniMax
- LM Studio
- OpenAI-compatible API
- OpenAI

Gemini and Anthropic exist as UI presets, but the Rust analysis path currently rejects providers outside MiniMax, OpenAI-compatible API, Ollama, and LM Studio.

## Observed Output Folders

The active TOL vault has these relevant folders:

- `03_TOL/RAW Audio`
  - raw recorder files
  - observed extension: `.mp3`
  - currently 36 files
- `03_TOL/TOL Transcripts`
  - current generated transcript notes
  - observed extension: `.md`
  - currently 35 files
- `03_TOL/TOL Analysis`
  - current generated analysis notes
  - observed extension: `.md`
  - currently 35 files
- `03_TOL/Transcripts`
  - legacy transcript area
  - mixed `.txt` and `.md`
- `03_TOL/TOL_Analysis`
  - legacy analysis area
  - `.md`

`VAULT_MAP.json` already marks these boundaries:

- raw audio is `raw_sources/audio`, immutable, not AI-managed
- current and legacy transcripts are derived sources
- current and legacy analyses are wiki-page-like analysis outputs

## Naming Model

Raw recorder files use compact recorder names:

- example: `260421_1003.mp3`

Derived transcript and analysis files use normalized timestamp stems:

- transcript: `2026-04-21-1003_TOL_Transcript.md`
- analysis: `2026-04-21-1003_TOL_Analysis.md`

Audio2TOL derives the normalized timestamp from the imported audio file modification time, not from a persisted manifest. For existing files this maps cleanly:

- `260421_1003.mp3` maps to `2026-04-21-1003`
- `260421_0756.mp3` maps to `2026-04-21-0756`

Implementation consequence:

- The Living Archive bundle builder must support both stem forms.
- It should derive candidate normalized stems from raw recorder names when possible.
- It should also fall back to file modification time and explicit user-selected files.
- A future Audio2TOL add-on should emit a manifest so ResonantOS does not have to infer links.

## Transcript Shape

Current transcripts are plain markdown text generated from Whisper without timestamps by default.

Observed characteristics:

- no structured frontmatter
- no speaker labels
- no chunk boundaries
- no confidence or transcription model metadata
- preserves raw thinking flow, including repetitions and transcription artifacts

Implementation consequence:

- The transcript is evidence, not trusted knowledge.
- TOL ingest should preserve the transcript as a source artifact and should not overwrite it with a cleaned synthesis.
- Any cleanup, extracted claims, entities, or conceptual pages must happen in review artifacts and trusted promotion.

## Analysis Note Shape

Generated analysis notes use frontmatter and a fixed semantic template.

Observed frontmatter fields:

- `aliases`
- `tags`
- `date`
- `time`
- `status`
- `type`
- `summary`
- `related`

Observed body sections:

1. `The Mirror (Synthesis & Fragile Ideas)`
2. `Dissonance & Friction`
3. `Strategic Next Actions (System Proposed)`
4. `Explicit Directives (Human-Stated To-Do List)`

Critical semantic distinction:

- `Strategic Next Actions` are AI-proposed.
- `Explicit Directives` are literal human-stated intentions extracted from the transcript.

Implementation consequence:

- The intake bundle must preserve this distinction.
- The Living Archive ingest agent must not collapse AI-proposed actions and human directives into one generic task list.
- Explicit directives should be treated as high-signal user intent, but still reviewable before becoming trusted memory.

## Protocol Shape

The TOL analysis prompt uses the Resonant Augmentor protocol.

Key rules:

- no sycophantic validation
- no generic summary unless converted into strategic structure
- extract fragile ideas
- treat contradiction as signal
- propose next actions only from the transcript
- separately extract literal human directives

Implementation consequence:

- The TOL bundle should include the protocol/template identity used to create the analysis.
- If future analyses are produced by a different protocol, the bundle must expose that difference to the ingest agent.

## Recommended TOL Intake Bundle Contract

ResonantOS should model TOL intake as an artifact bundle, not as a single file.

Minimum bundle fields:

```json
{
  "schemaVersion": 1,
  "bundleType": "audio2tol.session",
  "sourceAddonId": "addon.audio2tol",
  "sessionId": "2026-04-21-1003",
  "createdAt": "2026-04-24T00:00:00.000Z",
  "rawAudio": {
    "path": "03_TOL/RAW Audio/260421_1003.mp3",
    "originalFileName": "260421_1003.mp3",
    "sizeBytes": 40284913,
    "modifiedAt": "..."
  },
  "transcript": {
    "path": "03_TOL/TOL Transcripts/2026-04-21-1003_TOL_Transcript.md",
    "format": "md"
  },
  "analysis": {
    "path": "03_TOL/TOL Analysis/2026-04-21-1003_TOL_Analysis.md",
    "format": "md",
    "frontmatter": {
      "status": "Pending Ratification",
      "type": "TOL Analysis",
      "summary": "..."
    },
    "sections": {
      "mirror": "...",
      "dissonance": "...",
      "strategicNextActions": "...",
      "explicitDirectives": "..."
    }
  },
  "processing": {
    "transcriber": "whisper.cpp",
    "whisperModel": "large-v3",
    "analysisProvider": "MiniMax",
    "analysisModel": "MiniMax-M2.7",
    "protocolPath": "TOL - SYSTEM INJECTION.rtf",
    "templatePath": "TOL_Analysis_Template.md"
  },
  "boundaries": {
    "rawIsImmutable": true,
    "analysisIsDerived": true,
    "trustedWikiWriteAllowed": false
  }
}
```

## Ingest Rules For TOL

The Resonant Ingest Agent should treat TOL bundles with these rules:

- Raw audio remains the root source of truth.
- Transcript is a derived source.
- Analysis note is a protocol-guided interpretation, not final trusted knowledge.
- Human-stated directives must stay distinct from AI-proposed next actions.
- Fragile ideas should be preserved as fragile or developing concepts, not hardened too early.
- Dissonance sections should be treated as high-value signals for future synthesis pages.
- Doctrine-sensitive claims about Augmentatism, Cosmodestiny, ResonantOS identity, or AI alignment should require at least Strategist review before trusted promotion.
- Audio2TOL may write the bundle into archive intake, but it must not write directly into trusted Living Archive knowledge pages.

## Blind Spots And Required Fixes

- Audio2TOL does not currently emit a bundle manifest.
- Audio2TOL derives timestamps from file modification time, which is practical but not a durable provenance identifier.
- Transcript files do not include transcription model, language, chunking, duration, or confidence metadata.
- Analysis notes do not include provider/model/protocol/template metadata in frontmatter.
- The current app has UI presets for providers that are not fully wired in the Rust analysis path.
- Raw audio and derived outputs are currently linked by naming convention only.

## Implementation Recommendation

For ResonantOS vNext, the first implementation is a **TOL bundle detector and intake builder**:

1. detect sessions by normalized stem in `03_TOL/TOL Transcripts` and `03_TOL/TOL Analysis`
2. map normalized stems back to raw recorder stems when possible
3. parse analysis frontmatter and the four semantic sections
4. write one JSON bundle manifest into Living Archive intake
5. queue that bundle for review as `sourceType: "tol_bundle"`

Implemented host surfaces:

- `archive_tol_bundle_candidates`
- `archive_build_tol_bundle`

The current implementation deliberately keeps the bundle in intake/review. It does not promote Audio2TOL output directly into trusted wiki pages.

Later, when Audio2TOL becomes an add-on, update Audio2TOL to emit this manifest directly at processing time.
