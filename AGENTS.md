# Instructions for Cloud and Local Agents

## Read before implementation

1. Read `CLAUDE.md` for repository-wide architecture, code style, task commits, and verification timing. These instructions apply to every coding agent.
2. Read `Design.md`, `BACKEND_PATTERNS.md`, and `FRONTEND_PATTERNS_GUIDE.md`.
3. Read `docs/superpowers/plans/2026-11-13-v3st-naira-ramps-and-payouts.md` in full, including its adaptation table, beta provider policy and task interfaces.
4. Create a task checklist and implement the plan in dependency order. Create `DESIGN_SYSTEM.md` in Task 1 before writing components, pages, or styles.

## Required release scope

The user's beta-only instruction takes precedence over any implication of live operation in the original design or copied examples. The entire application is beta. Every external provider must use a verified sandbox/test environment or a local simulation. A provider without a verified sandbox is simulated; Paycrest is simulated-only.

Use the plan's beta policy for authentication, KYC/BVN, screening, wallets, RPCs, stock venues, FX/price feeds, earnings, treasury, bridges and notifications. No real funds, mainnet transactions, real identity submissions or live fallback are authorized. `NODE_ENV=production` describes an optimized build and never enables real providers. Missing partner access must not block a complete simulated beta.

The checked-in code is an unimplemented T3 starter. Its planned beta safeguards are not implemented yet. Do not supply real provider credentials or assume the starter is ready for external users.

## Portable execution

Use Node.js from `.nvmrc` and Yarn 1.22.22. Start with `bash scripts/setup-cloud.sh`; see `README.md` for database and environment setup. Prisma output is generated per platform during installation, not committed. Keep `yarn.lock` as the only committed package-manager lockfile.

The plan was authored with Superpowers. Use its subagent-driven-development or executing-plans workflow when installed. If those machine-local skills are unavailable in the cloud, execute the self-contained task checklist natively; record that fact and continue. Do not depend on absolute paths from the original developer's machine or silently install plugins with unrelated permissions.

Implement both backend and reachable frontend surfaces. Keep unresolved provider/legal decisions recorded and use explicit beta fixtures as specified. Do not claim a task's tests passed before running them. Follow `CLAUDE.md`'s final-only verification rule; the plan's per-task assertions are tests to write, not between-task gate commands.

Never commit `.env`, credentials, private keys, local databases, generated Prisma code, dependencies or build output. Commit focused task changes and update the checklist. This handoff authorizes implementation of the beta plan when assigned, not live activation, real-money smoke tests or deployment.
