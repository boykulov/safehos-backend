# Allowlist Subdomain Grouping

## Problem
Allowlist displayed as a flat list of domains. Subdomains like `stats.nebulanet.uz` and `api.nebulanet.uz` appeared separately from `nebulanet.uz`, making it hard to see domain relationships.

## Solution
Frontend-only grouping of subdomains under their root domain within each category.

### How it works
1. Within each category, domains are grouped by `getRootDomain(domain)` (existing function, handles two-part TLDs like co.uk)
2. Groups are sorted using the current sort mode (alpha/newest/oldest)
3. Three rendering modes per group:
   - **Single root, no subs**: plain item (unchanged from before)
   - **Root + subs**: root renders as normal list-item WITH expand/collapse toggle and sub-count badge. All existing buttons (Edit/Del/badges) preserved
   - **Subs only (no root in allowlist)**: virtual container header (italic, muted color, no Edit/Del) acts as group header only

### Visual design
- Groups wrapped in bordered container (`border: 1px solid #21262d`, `border-radius: 8px`)
- Virtual containers: italic font, muted color (`#7d8590`), slightly tinted background
- Subdomains: indented (`paddingLeft: 32px`), prefixed with `↳` arrow
- Expand/collapse: `▼` chevron with rotation animation
- Sub-count badge on group headers

### State
- `expandedGroups: Set<string>` - tracks expanded groups by key `category::rootDomain`
- Groups collapsed by default

## Files changed
- `safehos-moderator/src/components/ModeratorPanel.tsx` - the only file modified

## What was NOT changed
- Backend (no API changes)
- Database schema
- `normalizeDomain()` function
- `getRootDomain()` function (reused as-is)
- Filtering logic (search, category, type, date)
- Sorting logic (alpha/newest/oldest) 
- CSV import/export
- Add/Edit/Delete functionality
- Edit modal

## Wildcard Edit Auto-Approve (added later)

### Problem
Enabling wildcard via Edit on an existing allowlist entry did NOT auto-approve pending subdomains.
`updateEntry()` only updated the DB field — no side effects like the Queue approve flow.

### Root cause
`closeSubdomainPending()` was only called from `DomainService.applyModeratorDecision()` (Queue approve).
`AllowlistService.updateEntry()` had no awareness of pending events.

### Solution
Added full side effects to `updateEntry()` when `isWildcard` changes `false → true`:

1. **Detect change**: `wildcardJustEnabled = (updates.isWildcard === true && !entry.isWildcard)`
2. **Find pending subs**: query all `decision='pending'`, filter by `endsWith('.' + normalized)`
3. **For each subdomain**:
   - Update `decision='approved'`, `decidedBy=moderatorId`
   - Write `moderator_actions` audit log (source: 'wildcard')
   - WebSocket push `decision_made` to dispatchers
4. **No duplicate allowlist entries**: subdomains covered by wildcard, not added separately
5. **Idempotent**: if wildcard already `true`, no action taken

### Files changed
- `safehos-backend/src/domain/allowlist.service.ts` — `updateEntry()` + injected `ModeratorAction` repo + `EventsGateway`
- `safehos-backend/src/domain/domain.module.ts` — imports `ModeratorAction` entity + `GatewayModule`
- `safehos-moderator/src/components/ModeratorPanel.tsx` — `handleEditSave()` shows closed count, refreshes Queue

### What matches Queue approve flow
| Side effect | Queue approve | Wildcard edit |
|-------------|--------------|---------------|
| decision = 'approved' | yes | yes |
| decidedBy = moderatorId | yes | yes |
| moderator_actions audit | yes | yes (source: 'wildcard') |
| WebSocket push | yes | yes |
| No allowlist duplicate | yes | yes |
| normalizeDomain | yes | yes |

## Risks
- `getRootDomain()` may misidentify root for unusual TLDs not in its `twoPartTLDs` list - this is a pre-existing limitation
- Large number of subdomains in one group could make expanded view long - acceptable tradeoff
