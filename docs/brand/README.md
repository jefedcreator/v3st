# V3ST logo

Grain is the product logo. The landing and app use its mint treatment, as do the favicon and social image. The original green artwork is in [v3st-grain.svg](v3st-grain.svg). The preview records the three options drawn on 2026-11-20, alongside the former [V3ST wordmark](v3st-wordmark.svg).

![The three options on signal green and on void, small, as app icons and beside the wordmark](v3st-logo-options.png)

Each option draws a plant from the brief (harvest, growth, yield) as a bare mark, with no ring. They share one construction, so they differ in idea, not in style.

| Option | Stands for | The idea | Where the V is |
| --- | --- | --- | --- |
| `v3st-sprout.svg` | Growth | A seedling breaks the ground | Its two leaves open into a V |
| `v3st-grain.svg` | Harvest | An ear of grain rises from two leaves | The leaves make a V; the kernels pair into three more, so V3 |
| `v3st-crop.svg` | Yield | Three seedlings climb like a chart | Each opens into a V; there are three |

At small sizes the sprout holds up best down to 16px. The grain thins to a sliver at 16px but reads from 24px. The crop needs 32px.

## Construction

Each mark is drawn on a 100-unit square. Each file's viewBox is cropped to the drawing.

| Part | Rule |
| --- | --- |
| Stems and ground lines | 8 wide; the grain's stem is 7 |
| Leaves and kernels | Lenses, each set by the angle at its tips (74° to 92°) |
| Gap | 3.5 between shapes. Leaves start one gap from the stem's top corner, along their own axis |

`scripts/logo.mjs` measures every pair of shapes and refuses to draw if any two come closer than 2.8; lens tips may sit a little inside the gap. Change the numbers there and run it again rather than editing the SVGs by hand:

```sh
node scripts/logo.mjs
```

The script also generates the grain favicon. Both this generator and `scripts/social-image.mjs` render in Playwright's Chromium. Set `LANDING_CHROMIUM_PATH` to use a specific browser binary.
