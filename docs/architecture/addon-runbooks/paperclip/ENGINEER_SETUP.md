# Paperclip Add-on Engineer Setup Runbook

Status: planned add-on runbook  
Applies to: `addon.paperclip`  
Intent citation: `docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md`

## Setup Objective

Connect ResonantOS to a local Paperclip instance or install a supervised local Paperclip service inside the approved Paperclip add-on root, then verify that ResonantOS can embed the UI, query health, list companies/agents/issues, create issues from Delegation Packets, and collect artifacts into Living Archive intake.

## Human-Facing Summary

Paperclip is an optional organizational runtime. It can coordinate companies, agents, issues, runs, budgets, approvals, and traces. ResonantOS remains the outer control layer: provider policy, archive boundaries, capability grants, and user approvals stay inside ResonantOS.

The Resonant Engineer may set up Paperclip for the user, but only through reviewed host commands and only inside the approved Paperclip roots.

## Required Inputs

- approved Paperclip install root
- approved Paperclip config/data root
- selected mode: connect to existing service or launch local managed service
- local Paperclip endpoint or service port
- optional provider profile references mediated by ResonantOS
- optional Living Archive intake scope for Paperclip artifacts

## Required Capabilities

- `ui-embedding`: show Paperclip UI in a ResonantOS workspace
- `network`: reach local Paperclip HTTP API
- `shell`: run reviewed Paperclip host commands
- `filesystem`: use approved Paperclip install/config/data roots
- `notifications`: report status and approval events
- `archive-intake-write`: optional, queue Paperclip artifacts to intake
- `agent-delegation`: optional, create Paperclip issues from Delegation Packets
- `providers`: optional, only when ResonantOS mediates provider/profile access

## Allowed Host Commands

- `paperclip_status`
- `paperclip_detect_install`
- `paperclip_install_local`
- `paperclip_configure_service`
- `paperclip_start_service`
- `paperclip_stop_service`
- `paperclip_verify_service`
- `paperclip_open_workspace`
- `paperclip_list_companies`
- `paperclip_list_agents`
- `paperclip_list_issues`
- `paperclip_create_issue_from_delegation`
- `paperclip_read_issue`
- `paperclip_append_issue_comment`
- `paperclip_collect_issue_artifacts`
- `paperclip_queue_archive_intake`
- `paperclip_collect_logs`

## Setup Procedure

1. Run `paperclip_status` and `paperclip_detect_install`.
2. If an existing service is found, verify endpoint reachability before proposing installation.
3. If no service is found, propose `paperclip_install_local` using only the approved install root.
4. Ask for human approval before install, service configuration, service start, provider/profile wiring, or archive intake wiring.
5. Configure the service with `paperclip_configure_service`.
6. Start or connect to the service with `paperclip_start_service`.
7. Verify health with `paperclip_verify_service`.
8. Verify API visibility with `paperclip_list_companies`, `paperclip_list_agents`, and `paperclip_list_issues`.
9. Verify UI embedding with `paperclip_open_workspace`.
10. Write a setup report with all commands executed, all changed paths, active endpoint, enabled capabilities, and degraded warnings.

## Repair Procedure

1. Run `paperclip_status`.
2. Check whether the service endpoint is reachable.
3. Check install/config/data roots for missing files or permission errors.
4. Check port conflicts.
5. Check Paperclip logs through `paperclip_collect_logs`.
6. Check provider/profile warning state without reading raw secrets.
7. Propose the smallest repair action.
8. Execute only approved host commands after required approval.
9. Re-run `paperclip_verify_service`.
10. Write a repair report for Augmentor and the human.

## Expected Outputs

- Paperclip setup report
- health check result
- endpoint and workspace metadata
- capability grant summary
- service log summary
- audit log for privileged actions
- degraded-state reason if any required capability or service is unavailable

## Boundaries

- Do not share raw provider credentials with Paperclip by default.
- Do not grant unrestricted filesystem or unrestricted shell access.
- Do not allow Paperclip to write Living Archive knowledge pages.
- Do not allow Paperclip plugins to become ResonantOS add-ons automatically.
- Do not modify Paperclip company data without explicit user approval.
