# Audio2TOL Engineer Setup

Use this runbook when connecting an existing Audio2TOL installation or output vault to ResonantOS vNext.

## Objective

Verify that Audio2TOL output can be discovered through the Living Archive mappings, then enable host-mediated bundle preflight and intake queueing without giving the add-on direct write access to trusted knowledge pages.

## Inputs

- Existing Audio2TOL app or generated output folders.
- Living Archive vault root with TOL mappings for raw audio, transcripts, and analysis notes.
- Provider route policy for doctrine-sensitive TOL analysis.

## Checks

1. Confirm the add-on is installed and enabled.
2. Grant only the Audio2TOL intake workflow capabilities:
   - `filesystem`
   - `archive-read`
   - `archive-intake-write`
   - `providers`
3. Run `audio2tol.bundle_preflight`.
4. Confirm at least one candidate has transcript and analysis artifacts.
5. Queue bundle intake only after the human selects the intended session.

## Boundaries

- Do not delete raw recorder files.
- Do not rewrite transcripts during setup.
- Do not promote analysis notes into trusted memory directly.
- Do not run cloud provider analysis unless the selected provider profile permits it.
- Treat explicit human directives as reviewable source signals until archive review promotes them.

## Expected Output

- A passing preflight artifact when complete TOL sessions are detectable.
- A queued archive intake bundle for each approved session.
- A diagnostic note if no bundles are ready or the vault mappings are incomplete.
