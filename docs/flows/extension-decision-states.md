# Flow: Extension Decision States

## State Mapping

| Backend decision | Extension action | Page shown |
|-----------------|-----------------|------------|
| `trusted` / `approved` | Cache as 'trusted', pass through | (original site) |
| `pending` | Cache as 'pending', show waiting | **waiting.html** |
| `blocked` | Cache as 'blocked', block tab | **blocked.html** |
| `dangerous` (GSB) | Cache as 'blocked', block tab | **blocked.html** (type=dangerous) |

## Key Rule
**`pending` NEVER shows blocked.html.** Pending domains show waiting.html until moderator decides.

## Key Files
- `safehos-extension/background.js` — decision routing
- `safehos-extension/pages/waiting.html` + `js/waiting.js` — waiting UI
- `safehos-extension/pages/blocked.html` + `js/blocked.js` — blocked UI
