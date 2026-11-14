# Friday income schedule (actual configured timings)

All times are Africa/Lagos (UTC+1, no DST), computed in `src/backend/services/jobs/schedule.ts` from `policy.schedule`:

| Job | Lagos schedule | Purpose |
| --- | --- | --- |
| `earnings.harvest` | Thursday 22:00 | Schedules verified source actions (separate fee/distribution claims) for active strategy positions; no yield is computed from holdings |
| `earnings.float_precheck` | Thursday 23:00 | Ensures ramp float covers qualifying payout candidates |
| `earnings.payout_batch` | Friday 08:00–23:00 (hourly) | Pays or reinvests receipt-backed income, oldest-first, gross 200,000-kobo minimum |

Income exists only as finalized source proceeds: a reward receipt must be confirmed
on the local testnet, converted (consent-bound sell) when it is a reward token, and
recognized once before the Friday batch can reserve it for payout or reinvestment.
Static stock holding and idle cash pay zero cash; corporate-action multipliers affect
valuation only.
