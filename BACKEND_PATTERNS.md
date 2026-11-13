# Next.js Backend Patterns — Handover Document

This document describes the server-side architecture used in this project. A new agent implementing a fresh Next.js app should replicate every pattern here exactly.

---

## Table of Contents

1. [Project Layout](#1-project-layout)
2. [Core Dependencies](#2-core-dependencies)
3. [Custom Exception Classes](#3-custom-exception-classes)
4. [Request/Response Types](#4-requestresponse-types)
5. [Middleware System](#5-middleware-system)
6. [Validators (Zod)](#6-validators-zod)
7. [API Route Handlers](#7-api-route-handlers)
8. [Services Layer](#8-services-layer)
9. [Database (Prisma)](#9-database-prisma)
   - [Typed Prisma objects](#typed-prisma-objects-type-safety-rule)
10. [Auth (Cookie Sessions + OAuth)](#10-auth-cookie-sessions--oauth)
11. [Logging](#11-logging)
12. [Utility Helpers](#12-utility-helpers)
13. [Global Next.js Middleware](#13-global-nextjs-middleware)
14. [End-to-End Request Flow](#14-end-to-end-request-flow)
15. [Conventions & Rules](#15-conventions--rules)

---

## 1. Project Layout

```
src/
├── app/
│   └── api/                        # Next.js route handlers (canonical /api/v1/**)
│       └── v1/
│           ├── [resource]/
│           │   └── route.ts        # GET, POST handlers
│           └── [resource]/[id]/
│               └── route.ts        # GET, PUT, DELETE handlers
├── backend/
│   ├── clock.ts                    # now(): the only source of business time
│   ├── config/policy.ts            # typed beta policy constants
│   ├── integrations/beta-policy.ts # provider modes and sandbox URL allowlist
│   ├── observability.ts            # logRequest + reportError (only @sentry/nextjs importer)
│   ├── middleware/
│   │   ├── index.ts                # withMiddleware + all middleware fns
│   │   └── types.ts                # AuthRequest, MiddlewareFunction, etc.
│   ├── validators/
│   │   ├── index.validator.ts      # Shared: pagination, cuid, minor amounts
│   │   └── [resource].validator.ts # Per-domain Zod schemas (.strict())
│   ├── services/
│   │   └── [domain]/
│   │       └── index.ts            # Class-based singleton service
│   └── workers/
│       ├── run.ts                  # tsx worker entrypoint
│       └── handlers.ts             # idempotent progress-job handlers
├── server/
│   ├── db.ts                       # Prisma globalThis singleton
│   └── prisma.ts                   # re-exports the Prisma namespace from generated/
├── types/
│   ├── index.ts                    # ApiResponse / PaginatedApiResponse / ApiErrorResponse / ErrorCode
│   └── dto.ts                      # snake_case wire DTOs (money as integer strings)
├── utils/
│   ├── exceptions.ts               # HttpException subclasses (statusCode + code)
│   ├── money.ts                    # exact integer money and rate primitives
│   ├── index.ts                    # redact, sha256Hex, canonicalJson
│   └── response.ts                 # ok / created / accepted / paginated
└── middleware.ts                   # page guards — deferred to the frontend plan
```

Canonical API paths live under `/api/v1/**`. `next.config.js` rewrites the short forms
`/v1/:path*` and `/webhooks/:provider` to `/api/v1/...`.


---

## 2. Core Dependencies

```json
{
  "dependencies": {
    "next": "^15",
    "@prisma/client": "^6",
    "zod": "^3",
    "@t3-oss/env-nextjs": "^0.12",
    "@sentry/nextjs": "^11"
  },
  "devDependencies": {
    "prisma": "^6",
    "vitest": "^5",
    "vite": "^7",
    "tsx": "^4",
    "typescript-eslint": "^8"
  }
}
```

`jsonwebtoken` and `next-auth` are **not used** — sessions are random tokens stored in the database and transported via httpOnly cookie. No JWT signing, no NextAuth runtime. Linting is `eslint .` (`next lint` is deprecated in Next 15.5).

Required env vars (see `src/env.js`):
```
APP_STAGE=beta                    # literal; anything else refuses to boot
DATABASE_URL=                     # Prisma connection string
NEXT_PUBLIC_APP_URL=              # Public base URL (CORS origin check)
YELLOWCARD_MODE=simulated         # 'sandbox' (needs keys) or 'simulated'
YELLOWCARD_API_KEY=               # sandbox only
YELLOWCARD_API_SECRET=            # sandbox only
SIMULATED_IDENTITY_SECRET=        # simulated identity-token signing secret
PAYCREST_SIM_WEBHOOK_SECRET=      # simulated Paycrest webhook secret
SENTRY_DSN=                       # optional
```


---

## 3. Custom Exception Classes

**File:** `src/utils/exceptions.ts`

All HTTP errors are thrown as typed exceptions carrying a machine-readable `code`. The middleware maps them to the error envelope automatically.

```typescript
export class HttpException extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: ErrorCode
  ) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export class BadRequestException extends HttpException {
  constructor(message = 'Bad request', code: ErrorCode = 'BAD_REQUEST') {
    super(message, 400, code);
  }
}
// ... UnauthorizedException (401, 'UNAUTHENTICATED'), ForbiddenException (403, 'FORBIDDEN'),
// NotFoundException (404, 'NOT_FOUND'), ConflictException (409, code), PayloadTooLargeException
// (413, 'PAYLOAD_TOO_LARGE'), UnprocessableEntityException (422, 'VALIDATION_FAILED'),
// ServiceUnavailableException (503, code)

export class InternalServerErrorException extends HttpException {
  constructor(detail?: string) {
    super('Internal server error', 500, 'INTERNAL');
    if (detail !== undefined) this.cause = detail; // never sent to the client
  }
}
```

**Usage rule:** re-throw known `HttpException` subclasses as-is. Wrap unknown errors in `InternalServerErrorException(error.message)` — the public message is always `Internal server error`; the detail goes to `cause` and only to Sentry. Error responses are always `{ status, message, code, data: null }` (`ApiErrorResponse` in `src/types`).


---

## 4. Request/Response Types

**File:** `src/backend/middleware/types.ts`

### AuthRequest

Every route handler receives an `AuthRequest` instead of a plain `NextRequest`. It carries the parsed body, query params, path params, and the authenticated user with their session record.

```typescript
import type { Session, User } from '../../generated/prisma';
import { type NextRequest } from 'next/server';

// The full user object attached to every authenticated request
export type AuthenticatedUser = User & { session: Session };

export interface AuthRequest<B = unknown, Q = QueryParameters> extends NextRequest {
  parsedBody?: B;
  query?: Q;
  params?: Record<string, string>;
  validatedData?: unknown;
  user: AuthenticatedUser | null;
  rawBody?: Uint8Array;                    // bodyMode: 'raw' (webhook signatures cover raw bytes)
  idempotencyKey?: string;                 // from the Idempotency-Key header
  authTransport?: 'cookie' | 'bearer';
  requestId: string;                       // randomUUID(), echoed in X-Request-Id
}

export type MiddlewareResponse = {
  message: string;
  statusCode: number;
  next: boolean;
  code?: ErrorCode;
};

export type MiddlewareFunction<B = unknown, Q = QueryParameters> = (
  req: AuthRequest<B, Q>
) => Promise<MiddlewareResponse>;
```

### API Response Shapes

**File:** `src/types/index.ts`

```typescript
export interface ApiResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface PaginatedApiResponse<T> extends ApiResponse<T> {
  total: number;
  page: number;
  size: number;
  totalPages: number;
}

export interface ApiErrorResponse {
  status: number;
  message: string;
  code: ErrorCode;
  data: null;
}
```

Always return `ApiResponse` / `PaginatedApiResponse` from handlers (build them with `ok` / `created` / `accepted` / `paginated` from `src/utils/response.ts`) and `ApiErrorResponse` from errors. Wire DTOs are snake_case with money as integer strings — serializers live in `src/types/dto.ts`, never raw camelCase Prisma rows.


---

## 5. Middleware System

**File:** `src/backend/middleware/index.ts`

### `withMiddleware` — the route wrapper

Every exported handler must be wrapped with `withMiddleware`. It:

1. Resolves path params from Next.js `context.params` (awaited — Next 15 params are a Promise)
2. Parses the query string into `request.query`
3. Reads the body **once as bytes** and enforces `maxBodyBytes` (default 65 536) on both the declared `Content-Length` and the actual length — over the cap is `413 PAYLOAD_TOO_LARGE`. Then, per `options.bodyMode` (default `'json'`): `'json'` parses to `request.parsedBody` (unparseable is `400 MALFORMED_JSON`), `'raw'` sets `request.rawBody`, `'none'` skips the body
4. Runs each middleware function in sequence; short-circuits on the first `{ next: false }` response
5. Calls the handler
6. On any error returns an `ApiErrorResponse` (`{ status, message, code, data: null }`); `HttpException`s keep their status/message/code, anything else becomes `500 INTERNAL` with the public message `Internal server error`. `reportError` (Sentry) is called only for status ≥ 500 and middleware crashes
7. Sets `request.requestId = randomUUID()`, echoed in the `X-Request-Id` response header
8. Logs every request once via `logRequest(method, path, status, ms, redact(parsedBody))` after the response is generated

```typescript
export const withMiddleware = <B = unknown, Q = QueryParameters>(
  handler: (request: AuthRequest<B, Q>, context: { params: Record<string, string> }) => Promise<Response>,
  middlewares: MiddlewareFunction<B, Q>[],
  options?: { bodyMode?: 'json' | 'raw' | 'none'; maxBodyBytes?: number }
) => { /* ... */ };
```

### `authMiddleware`

Reads the session token from the `sara-session` httpOnly cookie (or falls back to `Authorization: Bearer <token>`), validates it against the `Session` table, checks expiry, and attaches `request.user = { ...user, session }`. Throws `UnauthorizedException` on any failure; deletes expired sessions lazily.

### `bodyValidatorMiddleware` / `queryValidatorMiddleware` / `pathParamValidatorMiddleware`

Validate `parsedBody` / `query` / `params` against a Zod schema. On failure they short-circuit with `422` and code `VALIDATION_FAILED`, reporting the first issue as `<path>: <message>`; on success the body result is attached to `request.validatedData`.

### `idempotencyKeyMiddleware`

Requires an `Idempotency-Key` header matching `^[A-Za-z0-9_-]{8,128}$` — missing is `400 IDEMPOTENCY_KEY_REQUIRED`, malformed is `400 BAD_REQUEST`. The key is attached to `request.idempotencyKey`.

### `originMiddleware`

When `authTransport === 'cookie'` and the method is neither GET nor HEAD, the `Origin` header must equal `new URL(env.NEXT_PUBLIC_APP_URL).origin`; otherwise `403 CROSS_ORIGIN`.


---

## 6. Validators (Zod)

**Directory:** `src/backend/validators/`

### Naming convention

- One file per domain: `deposit.validator.ts`, `withdrawal.validator.ts`, etc.
- Shared schemas live in `index.validator.ts`
- Every schema is `.strict()` — unknown keys are rejected
- Every schema exports its inferred type: `export type DepositValidatorSchema = z.infer<typeof depositValidatorSchema>`

### Shared schemas

**File:** `src/backend/validators/index.validator.ts`

```typescript
import { z } from 'zod';
import { parseMinor } from '@/utils/money';

// PostgreSQL CUIDs (@default(cuid())) — not MongoDB ObjectIds
export const cuidSchema = z.string().cuid();

// Wire money is a decimal integer string in minor units; parses to bigint, Zod issues instead of throws
export const minorAmountSchema = z.string().superRefine((val, ctx) => {
  try { parseMinor(val); } catch (e) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: (e as Error).message });
  }
}).transform((val) => parseMinor(val));

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  size: z.coerce.number().int().min(1).max(100).default(20),
}).strict();

export const idParamSchema = z.object({ id: cuidSchema }).strict();
```


---

## 7. API Route Handlers

**Directory:** `src/app/api/v1/[resource]/route.ts` (canonical; `/v1/*` and `/webhooks/*` rewrite here)

Every handler follows this exact structure and **calls services only** — never `db` directly:

```typescript
import { authMiddleware, bodyValidatorMiddleware, idempotencyKeyMiddleware, withMiddleware } from '@/backend/middleware';
import { depositValidatorSchema, type DepositValidatorSchema } from '@/backend/validators/deposit.validator';
import { depositService } from '@/backend/services/deposits';
import { created } from '@/utils/response';

// POST /api/v1/deposits — requires auth, body validation and an Idempotency-Key
export const POST = withMiddleware<DepositValidatorSchema>(
  async (request) => {
    const payload = request.validatedData as DepositValidatorSchema;
    const user = request.user!;
    const order = await depositService.create(user, payload, request.idempotencyKey!);
    return created(order, 'Deposit created');
  },
  [authMiddleware, bodyValidatorMiddleware(depositValidatorSchema), idempotencyKeyMiddleware]
);
```

- Middleware order matters: auth first, then validators (and the idempotency-key check on writes).
- Responses are built with `ok` / `created` / `accepted` / `paginated` (`src/utils/response.ts`) and serialised through explicit snake_case DTO serializers — money fields are integer strings.
- Nested routes live at `src/app/api/v1/[resource]/[id]/route.ts` with `pathParamValidatorMiddleware(idParamSchema)`.


---

## 8. Services Layer

**Directory:** `src/backend/services/[domain]/index.ts`

### Pattern: class-based singleton

```typescript
class DepositService {
  async create(user: AuthenticatedUser, payload: DepositValidatorSchema, idempotencyKey: string) {
    // withTx / ledger / provider calls
  }
}

export const depositService = new DepositService();
```

- Export the instantiated singleton, not the class
- Services never import from `@/app/api/` — only from `@/server/db`, other services, or provider interfaces
- Services throw `HttpException` subclasses for business-rule failures
- Multi-step writes use the interactive transaction helper `withTx` (`src/server/prisma.ts`), with `SELECT … FOR UPDATE` row locks for any read-compare-write (e.g. reservations) — **not** `db.$transaction([...])` arrays

### Session creation pattern

```typescript
import { randomBytes } from 'crypto';

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // 30 days
const SESSION_COOKIE_NAME = 'sara-session';

const createUserSession = async (userId: string) => {
  const sessionToken = randomBytes(32).toString('base64url');
  const expires = new Date(Date.now() + SESSION_MAX_AGE_SECONDS * 1000);
  await db.session.create({ data: { sessionToken, userId, expires } });
  return sessionToken;
};

// Set the httpOnly cookie on a NextResponse
const setSessionCookie = (response: NextResponse, sessionToken: string) => {
  response.cookies.set(SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    maxAge: SESSION_MAX_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
};
```


---

## 9. Database (Prisma)

**File:** `src/server/db.ts`

The Prisma client generates into `generated/prisma` (not committed). The `globalThis` singleton prevents hot-reload from opening multiple connections in development.

```typescript
import { env } from '@/env';
import { PrismaClient } from '../../generated/prisma';

const createPrismaClient = () =>
  new PrismaClient({
    log: env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });

const globalForPrisma = globalThis as unknown as { prisma: ReturnType<typeof createPrismaClient> | undefined };

export const db = globalForPrisma.prisma ?? createPrismaClient();

if (env.NODE_ENV !== 'production') globalForPrisma.prisma = db;
```

**File:** `src/server/prisma.ts` re-exports the generated namespace so every DB file uses one import:

```typescript
import { Prisma } from '@/server/prisma';
```

### Query conventions

- Paginated queries run `count` and `findMany` in parallel with `Promise.all`
- Multi-step writes go through `withTx((tx) => ...)`; conditional read-compare-write takes `SELECT … FOR UPDATE` row locks inside it
- Prefer explicit `.select()` / `.include()` over fetching full rows
- IDs are PostgreSQL CUIDs (`@default(cuid())`), validated with `cuidSchema` from `@/backend/validators/index.validator.ts`

### Typed Prisma objects (type-safety rule)

**Always** declare Prisma operation objects with an explicit `Prisma.*` type before passing them to a query. Never construct `where`, `data`, `orderBy`, `include`, or `select` objects inline without a type annotation.

```typescript
import { Prisma } from '@/server/prisma';

const data: Prisma.UserCreateInput = { email, name };
const where: Prisma.SessionWhereInput = { sessionToken };
const orderBy: Prisma.OrderOrderByWithRelationInput = { createdAt: 'desc' };
const args: Prisma.OrderFindUniqueArgs = { where: { id }, select: { id: true } };
```

| Object | Prisma type |
|--------|------------|
| `data` for create | `Prisma.EntityCreateInput` |
| `data` for update | `Prisma.EntityUpdateInput` |
| `where` clause | `Prisma.EntityWhereInput` |
| `orderBy` | `Prisma.EntityOrderByWithRelationInput` |
| `include` | `Prisma.EntityInclude` |
| Full query args | `Prisma.EntityFindUniqueArgs` / `Prisma.EntityFindManyArgs` |
| Narrowed return | `Pick<Entity, 'field1' \| 'field2'>` |


---

## 10. Auth (Cookie Sessions + OAuth)

**File:** `src/backend/services/auth/index.ts`

- Strategy: **database-backed sessions** via an httpOnly cookie (`sara-session`)
- Session tokens are cryptographically random 32-byte strings (not JWTs — no payload to decode, every request hits the DB)
- OAuth providers (Google, Facebook, Instagram) are handled manually in `AuthService` — no NextAuth at runtime

### Prisma models

```prisma
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  userId       String
  expires      DateTime
  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}

model Account {
  id                String  @id @default(cuid())
  userId            String
  type              String
  provider          String         // "google" | "facebook" | "instagram"
  providerAccountId String
  refresh_token     String?
  access_token      String?
  expires_at        Int?
  token_type        String?
  scope             String?
  id_token          String?
  session_state     String?
  user              User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([provider, providerAccountId])
  @@index([userId])
}
```

### OAuth + session flow

| Step | Route | What happens |
|------|-------|-------------|
| 1 | `GET /api/auth/[provider]` | Redirect user to OAuth authorization URL |
| 2 | `GET /api/auth/[provider]/callback` | Exchange code → token → user profile; find-or-create `User` + `Account`; call `createUserSession` |
| 3 | `AuthService.createUserSession(userId)` | Insert `Session` row with random token and 30-day expiry; return token |
| 4 | `setSessionCookie(response, token)` | Set `sara-session` httpOnly cookie on the redirect response |
| 5 | Subsequent requests | `authMiddleware` reads cookie, validates against `Session` table, attaches `request.user` |
| 6 | `POST /api/auth/logout` | Delete session row from DB; clear cookie |

### `AuthService` class pattern

```typescript
// src/backend/services/auth/index.ts
import { randomBytes } from 'crypto';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { db } from '@/server/db';

class AuthService {
  private readonly sessionMaxAgeSeconds = 60 * 60 * 24 * 30;
  private readonly cookieName = 'sara-session';

  async createCallbackResponse(request: NextRequest, providerId: Provider) {
    const code = request.nextUrl.searchParams.get('code')!;
    const tokenSet = await this.exchangeCodeForToken(providerId, code, request);
    const profile = await this.fetchProviderProfile(providerId, tokenSet);
    const user = await this.findOrCreateOAuthUser(providerId, profile, tokenSet);
    const sessionToken = await this.createUserSession(user.id);

    const response = NextResponse.redirect(new URL('/home', request.url));
    this.setSessionCookie(response, sessionToken);
    return response;
  }

  private async createUserSession(userId: string) {
    const sessionToken = randomBytes(32).toString('base64url');
    const expires = new Date(Date.now() + this.sessionMaxAgeSeconds * 1000);
    await db.session.create({ data: { sessionToken, userId, expires } });
    return sessionToken;
  }

  private setSessionCookie(response: NextResponse, sessionToken: string) {
    response.cookies.set(this.cookieName, sessionToken, {
      httpOnly: true,
      maxAge: this.sessionMaxAgeSeconds,
      path: '/',
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
  }
}

export const authService = new AuthService();
```

### Logout route

```typescript
// src/app/api/auth/logout/route.ts
export const POST = async (request: NextRequest) => {
  const sessionToken = request.cookies.get('sara-session')?.value;
  if (sessionToken) {
    await db.session.deleteMany({ where: { sessionToken } });
  }
  const response = NextResponse.redirect(new URL('/', request.url), { status: 303 });
  response.cookies.delete('sara-session');
  return response;
};
```

### Client usage

Cookies are sent automatically by the browser. No `Authorization` header is needed in browser clients. For API/mobile clients pass the session token as a Bearer header:

```typescript
// Browser — cookie is attached automatically, no extra header
fetch('/api/resource');

// Mobile / server-side — use the session token as Bearer
fetch('/api/resource', {
  headers: { Authorization: `Bearer ${sessionToken}` },
});
```

---

## 11. Logging

**File:** `src/backend/observability.ts` → `logRequest`, `reportError`

Logging is automatic — `withMiddleware` calls `logRequest` after every response. Do not call it manually in handlers. `reportError(error, context)` is the **only** importer of `@sentry/nextjs` and is called only from `withMiddleware` (status ≥ 500 and middleware crashes).

```typescript
export const logRequest = (method, url, statusCode, duration, payload?) => {
  const message = `${method} ${url} ${statusCode} - ${duration}ms`;
  if (statusCode >= 500) console.error(message); else console.log(message);
  if (payload && Object.keys(payload).length > 0) {
    console.debug(`Payload: ${JSON.stringify(payload)}`); // payload is already redact()ed
  }
};
```

Payloads are redacted before logging: `redact()` (`src/utils/index.ts`) replaces any value whose key matches `/(token|secret|password|account_?number|bvn|id_?number|phone|signature|authorization|cookie)/i` with `'[redacted]'`, recursively.


---

## 12. Utility Helpers

**File:** `src/utils/index.ts`

```typescript
// Replace secret-looking values with '[redacted]', recursively
export function redact(value: unknown): unknown;

// sha256 hex digest of a string or raw bytes (webhook signatures, canonical payloads)
export function sha256Hex(value: string | Uint8Array): string;

// JSON with sorted keys; bigint serialised as string
export function canonicalJson(value: unknown): string;
```

**File:** `src/utils/money.ts` — exact integer money primitives: `parseMinor` / `formatMinor` (canonical integer strings in minor units), `decimalToMinor`, `minorToProviderNumber`, `rateFromNgnPerUsd`, `ngnToUsd`, `usdToNgn` (explicit `'floor' | 'ceil'`), `rateToDto`, `parseProviderJson`. Amounts are integers (kobo for NGN, micro-units for USDC) — no floating point anywhere. `MAX_MINOR` caps minor values.

There is no `mongoIdValidator` (IDs are CUIDs — use `cuidSchema`) and no password hashing (no local passwords in beta).


---

## 13. Global Next.js Middleware

Page guards (`src/middleware.ts`) are **deferred to the frontend plan** — the beta delivers the `/api/v1` surface only, and API routes need no edge middleware. The only URL rewriting is in `next.config.js`:

```javascript
async rewrites() {
  return [
    { source: '/v1/:path*', destination: '/api/v1/:path*' },
    { source: '/webhooks/:provider', destination: '/api/v1/webhooks/:provider' },
  ];
}
```


---

## 14. End-to-End Request Flow

### Example: `POST /api/v1/deposits`

```
Client (browser)
  │
  ▼  POST /api/v1/deposits
  │  Content-Type: application/json
  │  Cookie: sara-session=<sessionToken>      ← set automatically by browser
  │  Idempotency-Key: <key>
  │  Body: { ngn_amount: "100000", stock_id: "..." }
  ▼
src/app/api/v1/deposits/route.ts → export const POST = withMiddleware(handler, [authMiddleware, bodyValidatorMiddleware(depositValidatorSchema), idempotencyKeyMiddleware])
  │
  ├─ withMiddleware reads the body once as bytes (64 KiB cap → 413), parses JSON (→ 400 MALFORMED_JSON), sets requestId
  │
  ├─ authMiddleware
  │    reads request.cookies.get('sara-session') (or Bearer token)
  │    db.session.findUnique({ where: { sessionToken }, include: { user: true } })
  │    checks session.expires > now(); attaches request.user = { ...user, session }
  │
  ├─ bodyValidatorMiddleware(depositValidatorSchema)
  │    validates request.parsedBody → attaches request.validatedData (422 VALIDATION_FAILED on issues)
  │
  ├─ idempotencyKeyMiddleware → request.idempotencyKey
  │
  ├─ handler(request)
  │    depositService.create(request.user!, validatedData, request.idempotencyKey!)
  │      — one withTx: order row + ledger entries + audit + follow-up job together
  │    return created(depositDto(order), 'Deposit created')   ← snake_case DTO, money as integer strings
  │
  ├─ withMiddleware catches any thrown HttpException
  │    → NextResponse.json({ status, message, code, data: null }, { status })   (500s never echo error.message)
  │
  └─ logRequest('POST', '/api/v1/deposits', 201, 38, redact(parsedBody)) — once, after the response

Client receives:
  { status: 201, message: 'Deposit created', data: { id, ngn_amount: '100000', ... } }
```

### Session flow (beta)

```
Client
  ▼  POST /api/v1/beta/identity-token { phone }        (simulated identity only)
  ▼  POST /api/v1/auth/session { identity_token }
     AuthService: validate token → find-or-create User → createUserSession
     → JSON 200 with the session token; response sets Cookie: sara-session=<token>; HttpOnly; SameSite=Lax; Secure in production
  ▼  subsequent requests carry the cookie (or Bearer token)
  ▼  POST /api/v1/auth/logout → deletes the Session row, clears the cookie, returns JSON 200 (no 303 redirect)
```


---

## 15. Conventions & Rules

1. **Every route handler** is wrapped in `withMiddleware`. No bare `export async function GET`.

2. **Middleware order matters.** Always: auth middleware first, then validator middlewares (and `idempotencyKeyMiddleware` on writes).
   ```typescript
   [authMiddleware, bodyValidatorMiddleware(schema)]
   [authMiddleware, pathParamValidatorMiddleware(idParamSchema), bodyValidatorMiddleware(schema)]
   [authMiddleware, bodyValidatorMiddleware(schema), idempotencyKeyMiddleware]
   ```

3. **Handler catch blocks** — never swallow errors silently, never return raw error details:
   ```typescript
   } catch (error) {
     if (error instanceof HttpException) throw error;
     throw new InternalServerErrorException(error instanceof Error ? error.message : String(error));
   }
   ```

4. **Error envelope is always `{ status, message, code, data: null }`.** 500s always say `Internal server error`; the real detail goes only to Sentry via `reportError`.

5. **Validators are strict** — `.strict()` on every Zod object schema to reject unknown fields.

6. **Wire money is integer strings.** kobo for NGN, micro-units for USDC; BigInt never crosses JSON. DTOs are snake_case, built by explicit serializers in `src/types/dto.ts` — never return raw camelCase Prisma rows.

7. **Pagination** always runs `count` and `findMany` in `Promise.all`. Return `{ total, page, size, totalPages }` via `paginated()`.

8. **Routes call services only.** Route handlers never import `db` — services are the only code that touches Prisma.

9. **Types flow from Zod.** Never write a TypeScript interface for a request body — derive it with `z.infer<typeof schema>`.

10. **Do not log inside handlers.** `withMiddleware` handles request logging automatically (with `redact`).

11. **Prisma singleton** uses the `globalThis` pattern to survive hot-reload in development.

12. **Sentry is only called via `reportError` from `withMiddleware`** — `src/backend/observability.ts` is the only importer of `@sentry/nextjs`.

13. **Prisma objects are always explicitly typed** using the `Prisma.*` namespace imported from `@/server/prisma` (the client generates into `generated/prisma`). Never pass an untyped object literal directly to a Prisma method. Narrow query return types with `Pick<Model, 'field'>` when `.select()` is used.

14. **Session tokens are random bytes, not JWTs.** Generate with `randomBytes(32).toString('base64url')`; every request validates the token against the `Session` table.

15. **httpOnly cookie is the auth transport.** `sara-session`, `sameSite: 'lax'`, `secure: true` in production. Never store the session token in `localStorage`.

16. **`request.user` is `User & { session: Session }`** — there is no business entity; `authMiddleware` eagerly loads the session row.

17. **Session cleanup on expiry** is lazy: `authMiddleware` deletes expired sessions before throwing `UnauthorizedException`.

18. **Canonical API paths are `/api/v1/**`**; `/v1/:path*` and `/webhooks/:provider` rewrite to them in `next.config.js`. Logout is `POST /api/v1/auth/logout` returning JSON 200, not a 303 redirect.

19. **Lint with `eslint .`** — `next lint` is deprecated in Next 15.5.
