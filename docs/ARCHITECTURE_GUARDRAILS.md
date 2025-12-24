# Architecture Guardrails (Calm MVP)

These guardrails apply to all services and integrations.

## Automation & AI
- No silent automation.
- No background AI decisions.
- AI is assistive, gated, and explainable.
- All inferred data must be explainable to the user.

## Data access & defaults
- No default bank connections.
- Read-only by default everywhere.
- Privacy, auditability, and consent are first-class concerns.

## Safety & reversibility
- All destructive actions must be reversible or explicitly confirmed.
- User approvals are required before any change that affects data or behavior.
