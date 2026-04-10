# Changelog: 2026-04-10

## Allowlist Subdomain Grouping

### Before
Allowlist displayed as flat list within each category. Subdomains like `stats.nebulanet.uz` and `api.nebulanet.uz` appeared separately from `nebulanet.uz`.

### After
Subdomains grouped under root domain with expand/collapse. Three modes:
- Single root, no subs: plain item (unchanged)
- Root + subs: root as expandable header with all buttons preserved
- Subs only: virtual container (italic, no Edit/Del)

### Files changed
- `safehos-moderator/src/components/ModeratorPanel.tsx` — grouping logic + UI

### Risks
- `getRootDomain()` TLD list is incomplete for exotic domains

---

## Wildcard Edit Auto-Approve

### Before (broken)
Enabling wildcard via Edit on allowlist entry updated only the DB field. Pending subdomains stayed in Queue. No audit log. No WebSocket push.

### Root cause
`updateEntry()` in `AllowlistService` had no side effects. `closeSubdomainPending()` only called from Queue approve flow.

### After
Full side effects on wildcard false -> true:
- Pending subdomains auto-approved with `decidedBy = moderatorId`
- `moderator_actions` audit log (source: 'wildcard')
- WebSocket `decision_made` push to dispatchers
- Frontend shows count + refreshes Queue

### Files changed
- `safehos-backend/src/domain/allowlist.service.ts` — `updateEntry()` + new dependencies
- `safehos-backend/src/domain/domain.module.ts` — imports ModeratorAction + GatewayModule
- `safehos-moderator/src/components/ModeratorPanel.tsx` — `handleEditSave()`

### Scenarios now working
1. Edit allowlist entry -> enable wildcard -> pending subdomains auto-approved
2. Edit allowlist entry -> wildcard already true -> no re-trigger
3. Auto-approved subdomains visible in History with source 'wildcard'
4. Extension gets instant WebSocket notification

### What must NOT break in future
- Wildcard false->true detection logic
- Audit log for every auto-approved subdomain
- normalizeDomain consistency between Queue and Edit flows
