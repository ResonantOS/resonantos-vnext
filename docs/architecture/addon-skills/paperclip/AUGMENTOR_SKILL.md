# Paperclip Augmentor Organizational Skill

Status: planned add-on skill  
Applies to: `addon.paperclip`  
Intent citation: `docs/architecture/ADR-028-paperclip-addon-organizational-runtime.md`

## Skill Objective

Help the human design, approve, and create a Paperclip organizational structure for business/project execution, while ResonantOS remains the outer authority for provider strategy, cost, memory, capabilities, approvals, and artifact intake.

## When To Use

Augmentor should suggest Paperclip when the user wants:

- a managed AI company, department, or project team
- multiple AI agents with clear roles
- recurring or long-running work
- budgeted execution
- issue/task traceability
- business/project operations that need coordination across agents or tools

## When Not To Use

Augmentor should not use Paperclip for:

- normal conversation
- one-shot questions
- direct trusted memory interpretation
- low-level ResonantOS repair
- secrets, wallet, or privileged provider recovery
- small tasks where a direct Augmentor answer or single delegation is enough

## Human Intent Intake

Before proposing a Paperclip structure, Augmentor should ask for:

- the goal of the organization or project
- what the user wants the company/team to produce
- expected operating cadence
- budget and provider preferences
- local/cloud model constraints
- approval preferences
- risk tolerance
- preferred roles, if any
- existing documents, memory references, or business context
- success criteria for the first working version

## Research Phase

If the domain is business, market, technical architecture, product strategy, legal/regulatory, or competitive analysis, Augmentor should research before proposing structure.

Research should produce:

- concise source-backed context
- relevant market or technical constraints
- role implications
- workflow implications
- provider/cost implications
- unknowns that require human clarification

## Proposal Phase

Augmentor should present a high-level company architecture before implementation.

The proposal should include:

- company or team name
- purpose
- operating model
- proposed roles such as CEO, CTO, Coder, Researcher, Analyst, Operator, QA, or Project Manager when appropriate
- responsibility boundaries for each role
- reporting/escalation flow
- issue/task templates
- provider/cost strategy
- approval gates
- expected first tasks
- risks and simplifications

The proposal should be readable by the human and not buried in implementation detail.

## Approval Gates

Augmentor must ask for approval before:

- creating a Paperclip company
- creating or modifying Paperclip agents
- creating system prompts or job descriptions that will be installed
- starting recurring/heartbeat work
- assigning provider or budget policies
- granting Paperclip new capabilities
- queueing Paperclip outputs into Living Archive intake

## Implementation Phase

After approval, Augmentor may use host-mediated Paperclip tools to:

- create a company from the approved architecture
- create or update Paperclip agents
- create role prompts and job descriptions
- create issue templates
- create initial issues from Delegation Packets
- assign work to Paperclip agents
- request status
- collect artifacts and traces
- queue outputs into Living Archive intake

Every mutating action must include an audit event and capability proof.

## Artifact Return

Paperclip should return:

- created company/team structure
- agent role definitions
- system prompts and job descriptions
- created issue ids
- execution status
- research notes
- final reports
- logs/traces
- cost and provider notes
- archive intake bundles

## Review And Iteration

Augmentor reviews Paperclip output with the human and decides whether to:

- revise company architecture
- modify agent roles
- create follow-up issues
- collect more research
- archive outputs as external work artifacts
- promote selected outputs through the active memory intake flow

## Safety Rules

- Paperclip is an execution organization, not the trusted Strategist.
- Paperclip agents are not automatically trusted memory writers.
- Provider secrets stay in ResonantOS unless the user explicitly accepts external-risk configuration.
- Cost strategy must be shown before major or recurring Paperclip work.
- Human approval is required before organization creation and before long-running work starts.
