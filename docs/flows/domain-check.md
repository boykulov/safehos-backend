# Flow: Domain Check

## Trigger
Dispatcher navigates to a URL -> Chrome extension intercepts

## Steps
1. Extension checks local cache (TTL 30 min)
2. Cache miss -> `POST /domain/check {url, tabId}`
3. Backend `DomainService.checkDomain()`:
   - `normalizeDomain()` (strip www, lowercase)
   - `AllowlistService.checkDomainPolicy()` — priority: org_block > global_block > org_allow > global_allow
   - If unknown: parallel [Google Safe Browsing, `scoreDomain()` heuristics]
   - GSB malicious -> auto-block + `createPendingReview(critical)`
   - Unknown -> **DEFAULT DENY** block + `createPendingReview()`
4. Return `{decision, riskScore, eventId, flags}`
5. Extension blocks tab if not trusted, shows blocked.html/waiting.html

## Key files
- `safehos-backend/src/domain/domain.service.ts` — `checkDomain()`
- `safehos-backend/src/domain/allowlist.service.ts` — `checkDomainPolicy()`, `findInList()`
- `safehos-extension/background.js` — `handleNavigation()`
