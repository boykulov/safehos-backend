# SafeHos - Architecture Overview

## System Purpose
SafeHos - default-deny security system for logistics dispatchers. Chrome extension blocks all unknown domains until a moderator approves them. Designed to protect trucking/logistics companies from phishing.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | NestJS 11, TypeORM, SQLite3 (better-sqlite3) |
| Auth | JWT + bcrypt, passport-jwt |
| WebSocket | Socket.IO 4.8 |
| Frontend (Moderator) | React 19, Axios, React Router 7, Lucide icons |
| External API | Google Safe Browsing v4 |

---

## Core Flow: Domain Check

```
Dispatcher navigates -> Extension checks cache (TTL 30min)
  -> Cache miss -> POST /domain/check
    -> normalizeDomain() (strip www, lowercase)
    -> AllowlistService.checkDomainPolicy()
       Priority: org_block > global_block > org_allow > global_allow
    -> If unknown: parallel [Google Safe Browsing, scoreDomain heuristics]
       -> GSB malicious: auto-block + createPendingReview(critical)
       -> Unknown: DEFAULT DENY block + createPendingReview
    -> Return {decision, riskScore, eventId, flags}
```

---

## Queue (Pending Events)

**Where created:** `DomainService.checkDomain()` -> `AllowlistService.createPendingReview()`

**Storage:** `domain_decisions` table with `decision='pending'`, `listType='pending_review'`

**Fields:** domain, companyId, riskScore, reason (URL + flags), decidedBy, requestedBy (dispatcher email)

**Polling:** ModeratorPanel fetches `GET /domain/pending` every 3 seconds

**Display:** Queue tab with risk color coding (red >=70, yellow >=40, blue <40), elapsed timer, domain/URL/flags/company/dispatcher

---

## Approve / Block Flow

```
Moderator clicks Approve/Block/Wildcard
  -> POST /decision/:eventId {action, isGlobal, isWildcard, category}
  -> DecisionService.makeDecision():
     1. Find event by ID (cross-company lookup)
     2. Save to moderator_actions (audit log, with source field)
     3. DomainService.applyModeratorDecision():
        - Approved: addToAllowlist (org_allow or global_allow)
        - Wildcard: addToAllowlist + closeSubdomainPending()
        - Blocked: addToBlocklist (org_block or global_block)
     4. Update ALL pending records for same domain
     5. WebSocket push: decision_made event
  -> Extension polling GET /decision/status/:eventId detects resolution
  -> Extension redirects to approved.html or blocked.html
```

---

## Allowlist / Blocklist

### Unified Table: `domain_decisions`

| Field | Description |
|-------|------------|
| id | UUID PK |
| domain | normalized (lowercase, no www) |
| companyId | null = global |
| decision | pending / approved / blocked / deferred / info |
| listType | global_allow / org_allow / global_block / org_block / pending_review / info |
| isWildcard | boolean - enables *.domain.com matching |
| isGlobal | boolean |
| category | loadboard/factoring/broker/carrier/maps/email/eld/tms/document/support/auth/cdn/other |
| approvedBy, decidedBy | moderator UUID |
| requestedBy | dispatcher email |
| notes, reason | text fields |
| riskScore | 0-100 |

### Policy Check Priority (checkDomainPolicy)

1. `org_block` -> **BLOCK** (org-specific blacklist)
2. `global_block` -> **BLOCK** (system-wide blacklist)
3. `org_allow` -> **ALLOW** (org whitelist)
4. `global_allow` -> **ALLOW** (system whitelist / seed data)
5. Not found -> **DEFAULT DENY** (block + create pending review)

### Wildcard Logic

- `findInList()` generates parent domains: e.g. `sub.domain.com` -> `['sub.domain.com', 'domain.com']`
- For parent domains, only matches if `isWildcard=1`
- `closeSubdomainPending()` auto-approves all pending where domain ends with parent
- Subdomains NOT added to allowlist separately (covered by wildcard entry)

---

## normalizeDomain

**Location:** `AllowlistService.normalizeDomain()` (allowlist.service.ts:112-123)

```typescript
normalizeDomain(input: string): string {
  if (!input) return '';
  try {
    const str = String(input).trim();
    const url = /^https?:\/\//i.test(str) ? str : `https://${str}`;
    let hostname = new URL(url).hostname;
    if (hostname.startsWith('www.')) hostname = hostname.slice(4);
    return hostname.toLowerCase();
  } catch {
    return String(input).trim().toLowerCase();
  }
}
```

**Used in:** checkDomain, addToAllowlist, addToBlocklist, removeFromList, updateEntry

---

## Scoring / Heuristics (scoreDomain)

**Location:** `DomainService.scoreDomain()` (domain.service.ts:237-272)

| Check | Points |
|-------|--------|
| Leet substitution matching brand | +60 |
| Typosquatting (1-2 char diff) | +45 |
| Brand inclusion (not exact) | +30 |
| Phishing platform (weebly, wixsite, etc.) | +25 |
| Suspicious keywords (login, secure, verify) | +20 |
| Random subdomain on platform | +20 |
| 2+ hyphens | +15 |
| 2+ digits | +15 |
| Long domain (>25 chars) | +10 |
| 3+ subdomain parts | +10 |
| Suspicious TLD (ru, xyz, tk, etc.) | +10 |

**Risk Levels:** 0=trusted, 1-40=low, 41-69=medium, 70-100=high

---

## Deferred Events

- Moderator defers for 15/30/60/120/240 minutes
- Updates decision to 'deferred', stores deferUntil in reason
- Events reappear in deferred tab with countdown timer
- Can still approve/block from deferred view

---

## ModeratorPanel.tsx Structure

**God component** (~850 lines, 15+ useState hooks)

**5 Tabs:**
1. **Pending Queue** - live polling, approve/block/wildcard/defer/global buttons
2. **Deferred** - deferred events with countdown
3. **Allowlist** - grouped by category, search/filter/sort, add/edit/delete, CSV import/export
4. **Blocklist** - simple list, search, unblock button
5. **History** - grouped by domain, expandable, shows source/category/response time

**Notifications:** Sound (880Hz new, 1047Hz approve, 440Hz block) + toast (4s timeout)

---

## Key Decision Points

| # | Where | What |
|---|-------|------|
| 1 | `AllowlistService.checkDomainPolicy()` | Primary policy engine - allow/block verdict |
| 2 | `DomainService.scoreDomain()` | Risk scoring for unknown domains |
| 3 | `AllowlistService.createPendingReview()` | Creates queue entry for unknowns |
| 4 | `DomainService.applyModeratorDecision()` | Writes decision to allowlist/blocklist |
| 5 | `AllowlistService.closeSubdomainPending()` | Auto-approves subdomains on wildcard |
| 6 | `DecisionService.makeDecision()` | Orchestrates: decision + audit + WebSocket |

---

## API Endpoints

### Domain
- `POST /domain/check` - check URL safety
- `GET /domain/pending` - queue (pending events)
- `GET /domain/deferred` - deferred events
- `POST /domain/defer/:eventId` - defer
- `DELETE /domain/decision/:domain` - reset domain

### Allowlist
- `GET /domain/allowlist` - list (filtered by company)
- `POST /domain/allowlist` - add
- `PATCH /domain/allowlist/:id` - edit (category, notes, wildcard)
- `POST /domain/allowlist/import` - CSV import
- `GET /domain/allowlist/export` - CSV export

### Blocklist
- `GET /domain/blocklist` - list

### Decisions
- `POST /decision/:eventId` - make decision
- `GET /decision/status/:eventId` - check status
- `GET /decision/history` - audit history

### Auth
- `POST /auth/login` - login
- `POST /auth/register` - register
- `POST /auth/identify` - auto-register (extension)
- `GET /auth/me` - profile

---

## Seed Data

- **85+ logistics domains** seeded as global_allow with wildcard (load boards, brokers, factoring, ELD, TMS, maps, email, auth, CDN, documents, support)
- **3 phishing domains** seeded as global_block
