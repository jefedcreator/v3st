---
version: 1
slug: "src-app-marketing-page-tsx"
primary_target: "src/app/(marketing)/page.tsx"
related_targets: []
---

# Surface brief: V3ST landing page

Mode: Persuade. Scope: the anonymous route `/` (`src/app/(marketing)/page.tsx`) and the `(marketing)` layout it shares with `/legal/*` and `/waitlist`. Those two are reading pages inside the same world.

- Audience: Nigerian first-time investors. Base Stocks Maxxing judges see the page as a customer would.
- Job: understand that ₦1,000 can go into US companies they already know, that Earn is optional and can earn nothing, and that this is a beta with test money.
- Action: join the beta waitlist, in working form in the first viewport and again at the close.
- Proof on hand: real beta prices in naira from the public catalog read; product rules from `policy.ts` (₦1,000 minimum, 1% slip cap, 30-day permissions, ₦2,000 payout minimum); official logos of the 12 services V3ST is built to work with.
- Constraints: behaviour pinned to katana.network through the design spec's behaviour contract; crypto vocabulary kept out of copy; no invented numbers or partnership claims; `noindex` until a public-release decision; one dark theme.
- Memorable moment: the pinned hero handing over from the green fluid field to the live naira ticker.
- Unresolved at handoff: none. The social-image mechanism and each brand's logo treatment are builder calls within the spec.

Authoritative design: `docs/superpowers/specs/2026-11-17-v3st-landing-redesign-design.md`. Plan: `docs/superpowers/plans/2026-11-18-v3st-landing-redesign.md`.

## Direction contract

THESIS: A naira-first investing beta that looks and moves like Katana: one near-black field, one green signal, a pinned hero that hands over to living proof. It refuses the category default of a bright fintech page full of phone mockups, invented user counts and stock-photo smiles.

OWN-WORLD: Green-tinted void ground (#020604) with layered surfaces (#08100C) and hairline strokes (#15211B). White Bricolage Grotesque at weight 300 for display. One signal green (#00804D) for filled pills, the fluid glow and the outlines of price rows; mint (#3DDC97) for gains and focus; coral (#FF6B5A) for losses. Pill controls, 28px cards, glowing-outline price rows, and small tracked uppercase labels used only inside data and logo rows, never above a heading.

STORY: A first-time Nigerian investor understands they can put ₦1,000 into companies they know, sees real beta prices in naira, learns that Earn is optional and can earn nothing, checks the safeguards, and joins the waitlist.

FIRST VIEWPORT: A centred composition on the green fluid field. "Invest. Earn. Harvest." at 6rem, weight 300, white. A one-sentence subline. The waitlist form directly beneath: one pill holding the email field and a green "Join the waitlist" button, with beta and privacy microcopy under it. A three-counter rail along the bottom. The header holds the V3ST wordmark and Beta chip on the left, Katana's centred pill navigation, and a pause control at the right edge; its "Join the waitlist" pill stays hidden until the hero hands over.

FORM: Katana's landing grammar, pinned by the operator; position 1 of 1; seed: none (unavailable)

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

On this repository DESIGN.md means `DESIGN_SYSTEM.md`, because `DESIGN.md` collides with the product document `Design.md` on case-insensitive filesystems. Build path: code-led.
