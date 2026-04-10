# Flow: Wildcard Edit Auto-Approve

## Trigger
Moderator edits existing allowlist entry and enables wildcard (false -> true)

## Steps
1. Frontend `PATCH /domain/allowlist/:id {category, notes, isWildcard: true}`
2. `AllowlistService.updateEntry()`:
   - Detect `wildcardJustEnabled = (updates.isWildcard === true && !entry.isWildcard)`
   - Save updated entry
   - If wildcard just enabled:
     - Find all `decision='pending'` events
     - Filter subdomains: `domain.endsWith('.' + normalizedRoot)`
     - For each subdomain:
       - Set `decision='approved'`, `decidedBy=moderatorId`
       - Write `moderator_actions` audit (source: 'wildcard')
       - WebSocket push `decision_made` to dispatchers
3. Return `{...entry, closedSubdomains: count}`
4. Frontend shows notification with count, refreshes Queue and Deferred

## Side effects parity with Queue approve

| Effect | Queue approve | Wildcard edit |
|--------|--------------|---------------|
| decision = 'approved' | yes | yes |
| decidedBy = moderatorId | yes | yes |
| moderator_actions audit | yes (source: 'queue') | yes (source: 'wildcard') |
| WebSocket push | yes | yes |
| No allowlist duplicate for subs | yes | yes |

## Idempotency
- If wildcard already true, no action taken
- Only triggers on actual false -> true transition

## Key files
- `safehos-backend/src/domain/allowlist.service.ts` — `updateEntry()`
- `safehos-moderator/src/components/ModeratorPanel.tsx` — `handleEditSave()`
