# Decision: Full Side Effects on Wildcard Edit

## Date
2026-04-10

## Context
Enabling wildcard via Edit in Allowlist only updated the DB field. Pending subdomains remained in Queue. This was inconsistent with Queue approve flow which auto-closes subdomains.

## Decision
Add full side effects to `AllowlistService.updateEntry()` when wildcard transitions false -> true:
- Auto-approve pending subdomains
- Write audit log entries (moderator_actions)
- Send WebSocket push to dispatchers

## Alternative considered
- Call `DomainService.applyModeratorDecision()` from controller — rejected due to circular dependency risk (DecisionModule imports DomainModule)
- Make `closeSubdomainPending` public — rejected because it lacks audit log and WebSocket

## Implementation
Injected `ModeratorAction` repo and `EventsGateway` directly into `AllowlistService`. This avoids circular dependencies while providing all needed side effects.

## What NOT to break
- Wildcard already-true edits (category/notes change) must NOT re-trigger subdomain approval
- Only false -> true transition triggers side effects
- Subdomains must NOT be added to allowlist (covered by wildcard)
