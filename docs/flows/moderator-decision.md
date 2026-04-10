# Flow: Moderator Decision (Queue Approve/Block)

## Trigger
Moderator clicks Approve/Block/Wildcard in Queue or Deferred tab

## Steps
1. Frontend `POST /decision/:eventId {action, isGlobal, isWildcard, category}`
2. `DecisionService.makeDecision()`:
   - Find event by ID (cross-company lookup)
   - Write `moderator_actions` audit log (source: 'queue')
   - Call `DomainService.applyModeratorDecision()`:
     - Approved: `addToAllowlist()` (skip if covered by wildcard parent)
     - Wildcard approved: also `closeSubdomainPending()` — auto-approves all pending subs
     - Blocked: `addToBlocklist()`
   - Update ALL pending records for same domain to approved/blocked
   - WebSocket push `decision_made` to dispatchers
3. Extension polling `GET /decision/status/:eventId` detects resolution
4. Extension redirects: approved -> approved.html, blocked -> blocked.html

## Key files
- `safehos-backend/src/decision/decision.service.ts` — `makeDecision()`
- `safehos-backend/src/domain/domain.service.ts` — `applyModeratorDecision()`, `closeSubdomainPending()`
- `safehos-backend/src/domain/allowlist.service.ts` — `addToAllowlist()`, `addToBlocklist()`
- `safehos-moderator/src/components/ModeratorPanel.tsx` — `handleDecision()`, `handleWildcardDecision()`
