# RecursiveMAS Add-on Engineer Setup Runbook

Status: planned experimental add-on runbook  
Applies to: `addon.recursive-mas`  
Intent citation: `docs/architecture/ADR-030-recursive-mas-runtime-addon.md`

## Setup Objective

Connect ResonantOS to a local or user-owned RecursiveMAS service, verify that supported models and collaboration styles are available, expose the runtime as an experimental Provider Fabric node, and prove that a small delegated reasoning task returns audited artifacts.

## Human-Facing Summary

RecursiveMAS is an optional specialist reasoning runtime. It can coordinate open local models through recursive multi-agent inference. It is useful when the user wants local or lower-cost reasoning, independent verification, or recursive challenge passes.

It is not the default Augmentor brain and does not replace Augmentor Chat. ResonantOS remains responsible for provider routing, cost policy, capability grants, archive boundaries, and audit.

## Required Inputs

- selected setup mode: connect to existing service or configure local managed service
- approved RecursiveMAS install root
- approved model/checkpoint/cache root
- approved run-output root
- local or user-owned remote service endpoint
- selected V0 style, default `sequential_light`
- optional provider/runtime node label
- optional scoped Living Archive read scope
- optional archive intake scope for final artifacts

## Required Capabilities

Minimum:

- `providers`
- `network`
- `agent-delegation`
- `notifications`

Managed setup:

- `shell`
- `filesystem`

Optional:

- `archive-read`
- `archive-intake-write`

## Allowed Host Commands

- `recursive_mas_status`
- `recursive_mas_detect_install`
- `recursive_mas_configure_service`
- `recursive_mas_start_service`
- `recursive_mas_stop_service`
- `recursive_mas_verify_service`
- `recursive_mas_list_models`
- `recursive_mas_list_styles`
- `recursive_mas_estimate_task`
- `recursive_mas_run_task`
- `recursive_mas_cancel_task`
- `recursive_mas_collect_artifacts`
- `recursive_mas_queue_archive_intake`
- `recursive_mas_collect_logs`

## Setup Procedure

1. Run `recursive_mas_status`.
2. If an endpoint is configured, verify it is loopback or explicitly user-owned remote infrastructure.
3. Run `recursive_mas_detect_install` inside approved roots only.
4. If the service is missing, explain that RecursiveMAS is experimental and ask before any install/config action.
5. Ask for human approval before model downloads, checkpoint configuration, service launch, provider-node registration, or archive wiring.
6. Configure service metadata with `recursive_mas_configure_service`.
7. Start or connect to the service with `recursive_mas_start_service`.
8. Verify service health with `recursive_mas_verify_service`.
9. List available models with `recursive_mas_list_models`.
10. List available styles with `recursive_mas_list_styles`.
11. Confirm `sequential_light` is available before marking the add-on usable.
12. Run a tiny non-sensitive smoke task with `recursive_mas_run_task`.
13. Collect artifacts with `recursive_mas_collect_artifacts`.
14. Write a setup report that lists commands, changed paths, endpoint, model/style availability, runtime node id, degraded warnings, and audit events.

## Repair Procedure

1. Run `recursive_mas_status`.
2. Check endpoint reachability and ownership.
3. Check approved install/model/cache/output roots.
4. Check missing checkpoints or adapter files.
5. Check GPU/runtime availability if reported by the service.
6. Check service logs with `recursive_mas_collect_logs`.
7. Check whether a recent model download or config change caused degradation.
8. Propose the smallest repair action.
9. Ask for human approval before mutating files, downloading models, changing endpoints, or restarting service.
10. Re-run verification and write a repair report.

## Expected Outputs

- setup or repair report
- service health result
- model list
- style list
- selected runtime node metadata
- smoke task result
- artifact directory path
- audit log summary
- degraded-state reason, if any

## Boundaries

- Do not expose raw provider secrets to RecursiveMAS.
- Do not grant unrestricted filesystem or shell.
- Do not write trusted Living Archive knowledge pages.
- Do not use sensitive personal memory in smoke tests.
- Do not claim production readiness until real-model tests pass.
- Do not treat RecursiveMAS agents as trusted equals of Augmentor.
