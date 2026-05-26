# Add-on Augmentor Skill Template

Status: SDK template  
Owner: ResonantOS add-on platform

## Purpose

An Augmentor skill tells the Strategist how to use an add-on well with the human.

It is not a setup guide. It is an operating method for high-quality use of the add-on: how to clarify intent, gather context, research, plan, request approval, delegate work, collect artifacts, and explain results.

## Manifest Link

The add-on manifest should include:

```json
{
  "augmentorSkills": [
    {
      "documentPath": "addons/<addon-id>/AUGMENTOR_SKILL.md",
      "objective": "Help the human use this add-on through a clear, approved operating workflow.",
      "requiredCapabilities": ["agent-delegation", "network"],
      "requiredTools": ["<addon>.create_plan", "<addon>.execute_approved_plan"],
      "workflowPhases": ["intent intake", "research", "proposal", "approval", "implementation", "review"],
      "approvalGates": ["approve plan", "approve execution"],
      "expectedInputs": ["human intent", "constraints", "provider policy"],
      "expectedOutputs": ["approved plan", "delegation packets", "result summary"],
      "producesDelegationPackets": true,
      "auditLogRequired": true
    }
  ]
}
```

## Required Sections

### 1. Skill Objective

State what Augmentor should help the human achieve with the add-on.

### 2. When To Use

Define the situations where Augmentor should suggest or use this add-on.

### 3. When Not To Use

Define cases where the add-on would add complexity, risk, cost, or unnecessary delegation.

### 4. Human Intent Intake

List the questions Augmentor should ask before planning.

The goal is to extract vision, constraints, budget, success criteria, timeline, operating style, risk tolerance, and approval preferences.

### 5. Research Phase

Define when Augmentor should research before proposing a plan.

Research output must include:

- sources used
- assumptions
- uncertainty
- implications for the proposed plan

### 6. Proposal Phase

Define the plan Augmentor presents to the human before execution.

The proposal should be concise and decision-oriented. It should show the meaningful structure and tradeoffs, not every technical detail.

### 7. Approval Gates

List the decisions that require human approval before implementation.

Examples:

- create external organization/company/project
- create or modify agents
- change provider/cost routing
- grant capabilities
- write archive intake artifacts
- start recurring or long-running work

### 8. Implementation Phase

Define which host-mediated tools Augmentor may call after approval.

The skill must not instruct Augmentor to bypass ResonantOS capability grants or call undeclared tools.

### 9. Artifact Return

Define what comes back to ResonantOS:

- summaries
- created structures
- prompts/job descriptions
- issue/task ids
- research notes
- logs/traces
- archive intake bundles

### 10. Review And Iteration

Define how Augmentor reviews results with the human and decides whether to iterate, delegate follow-up work, or send artifacts to memory intake.

## Safety Rules

- The skill is guidance, not permission.
- Required capabilities must be declared by the add-on manifest.
- Required tools must be declared by the add-on manifest.
- Human approval is required before external, financial, public, destructive, or long-running actions.
- Provider cost strategy must be visible before major work begins.
- Outputs that may become memory must go through the active memory provider or Living Archive intake boundary.
