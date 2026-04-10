# Decision: Subdomain Grouping — Frontend Only

## Date
2026-04-10

## Context
Allowlist displayed as flat list. Subdomains of the same root domain appeared scattered, making it hard to understand domain relationships.

## Decision
Implement subdomain grouping entirely on the frontend (inside ModeratorPanel.tsx), without any backend API changes.

## Rationale
- Backend already returns all allowlist entries in one `GET /domain/allowlist` call
- `getRootDomain()` function already existed on frontend
- No need for new API endpoints or DB schema changes
- Grouping is a UI concern — data model is unchanged

## Trade-offs
- **Pro**: Zero backend changes, zero migration risk, zero API compatibility issues
- **Con**: Grouping logic recalculated on every render (acceptable for current scale)
- **Con**: `getRootDomain()` doesn't cover all exotic TLDs — pre-existing limitation

## What NOT to break
- Filtering (search, category, type, date) must work on individual domains, not groups
- Sort order must be preserved within groups
- Edit/Delete/badges must work on each domain independently
- CSV import/export unaffected
