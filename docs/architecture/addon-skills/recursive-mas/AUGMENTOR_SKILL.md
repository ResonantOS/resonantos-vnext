# RecursiveMAS Augmentor Reasoning Skill

Status: planned experimental add-on skill  
Applies to: `addon.recursive-mas`  
Intent citation: `docs/architecture/ADR-030-recursive-mas-runtime-addon.md`

## Skill Objective

Help Augmentor decide when to delegate work to RecursiveMAS, how to package the task, and how to review returned recursive-reasoning artifacts without treating RecursiveMAS as the user's primary trusted AI.

## When To Use

Suggest RecursiveMAS when the task benefits from:

- local or lower-cost reasoning before cloud escalation
- independent challenge or verification
- multiple reasoning perspectives
- archive-review support
- strategy/design synthesis
- benchmark-like reasoning
- non-urgent final-answer generation

## When Not To Use

Do not use RecursiveMAS for:

- normal fast chat
- direct code editing
- direct shell/process execution
- wallet, signing, or secrets work
- tasks requiring current web research unless another approved research tool provides sources
- trusted Living Archive page writes
- tasks where the add-on is missing models, degraded, or not enabled

## Intake Questions

Before delegation, Augmentor should identify:

- what question or artifact the user needs
- whether final-only output is acceptable
- whether local/offline reasoning is preferred
- whether the task should challenge an existing answer
- whether scoped Living Archive context is needed
- whether citations or source references are required
- acceptable latency and compute cost
- fallback route if RecursiveMAS is unavailable

## Delegation Packet Requirements

RecursiveMAS tasks should include:

- concise mission
- expected output form
- allowed context references
- forbidden data categories
- selected style, default `sequential_light`
- provider/runtime policy
- cost policy
- verification requirements
- expected artifacts
- return protocol

The packet should avoid broad instructions like "investigate and fix." RecursiveMAS receives reasoning tasks, not unsupervised system-repair authority.

## Workflow Phases

1. Decide whether RecursiveMAS is the right runtime.
2. Check add-on status and provider route availability.
3. Prepare a Delegation Packet.
4. Ask for human approval if the task uses sensitive memory, archive context, long runtime, or paid/remote compute.
5. Dispatch through the host-mediated RecursiveMAS tool.
6. Review final answer, warnings, runtime metadata, and artifacts.
7. Decide whether to answer the user, escalate to a stronger model, or create a follow-up task.
8. Queue useful outputs into Living Archive intake only when appropriate and granted.

## Approval Gates

Ask for approval before:

- using sensitive Living Archive context
- running a long or expensive local/remote job
- routing to WAN remote infrastructure
- downloading or switching models
- queueing outputs into archive intake
- using RecursiveMAS output to influence a high-impact decision

## Expected Outputs

RecursiveMAS should return:

- final answer or report
- selected style
- model/checkpoint metadata
- runtime node metadata
- run status
- warnings/degraded notes
- timing and resource estimates where available
- artifact paths
- optional citations if the task included approved sources

## Review Rules

Augmentor should treat RecursiveMAS output as specialist evidence, not final authority.

For important decisions, Augmentor should:

- compare the output against source material
- identify unsupported claims
- check whether the runtime warned about model/style limitations
- decide whether to ask another model to verify
- explain uncertainty to the human

## Safety Rules

- RecursiveMAS is not the trusted Strategist.
- RecursiveMAS agents are not trusted memory writers.
- Hidden-state traces are not user-facing memory by default.
- Archive writes are intake-only.
- Provider and cost policy remain under ResonantOS control.
- Human approval is required for sensitive or expensive use.
