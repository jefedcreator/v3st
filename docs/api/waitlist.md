# Waitlist API

The public landing page's beta waitlist. It stores sign-ups only: nothing is emailed automatically.

## `POST /api/v1/waitlist`

Anonymous, same-origin, rate-limited (5 requests per 10 minutes per client address, PostgreSQL-backed; the address is stored only as an HMAC key, never raw).

| Content type | Body | Response |
| --- | --- | --- |
| `application/json` | `{ email, source?, website? }` | Normal envelope |
| `application/x-www-form-urlencoded` | `email=…&source=…` | `303` redirect to `/waitlist?status=…` |

- `email` — trimmed, lowercased, max 254 chars, must be a valid email. Failure: `422 CHECK_DETAILS` with the field message "Enter a valid email address."
- `source` — `hero` (default), `join` or `waitlist_page`.
- `website` — honeypot, max 200 chars. A filled honeypot answers success and stores nothing.

Success (JSON): `200 { status: 200, message: "You're on the list.", data: { joined: true } }`. The same answer is returned whether the email is new or already on the list, and one row is kept.

Redirect statuses on form posts: `joined` on success; otherwise the lowercase customer code, e.g. `check_details` (validation), `not_allowed` (cross-origin), `too_many_tries` (429 `RATE_LIMITED`). Repeated form fields and other content types answer `400` (redirected as `check_details` for url-encoded requests).

A cross-origin `Origin` header answers `403`. Rate limiting over the limit answers `429` with customer code `TOO_MANY_TRIES`.

## `GET /api/v1/ops/waitlist?page=&size=`

Operator role required (`authMiddleware` + `operatorMiddleware`). Returns the paginated envelope with `data` items `{ email, source, privacy_version, created_at }`, newest first. `privacy_version` is the privacy document version the visitor saw (`2026-11-18` since the waitlist note).

## Operations

Export sign-ups with `GET /api/v1/ops/waitlist`. Customers can sign in directly at `/signin` with their email address. See the [beta runbook](../runbooks/backend-beta.md).
