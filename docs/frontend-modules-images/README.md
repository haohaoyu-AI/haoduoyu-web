# Bounded visual sign-off: existing 1440px captures

These are the original PNG bytes extracted from the already preserved
`haoduoyu-phase4a-abe3540-evidence.tar.gz`, not new browser captures. All four
original hashes match the initial 56-pair screenshot manifest. `manifest.json`
records the archive, original images, raw differences, crops and hashes.
Only these two requested cases are included; the full 166-image archive is not
added to the repository.

## Creation of an AI credential

- [Original baseline, 1440 × 900](baseline-form-key-1440.png)
- [Original candidate, 1440 × 900](candidate-form-key-1440.png)
- [Raw absolute RGB difference, original size](form-key-1440.diff.png)
- [Two corner crops at 8× nearest-neighbor scale](form-key-1440.zoom8.png)

The original-size images show the same dialog placement and dimensions, title,
empty credential-name field, synthetic account choices, permissions, buttons,
focus outline and backdrop. No text, control, clipping or spacing change is
visible. The raw difference has 16 changed pixels, each at most one 8-bit color
unit, at the bottom rounded corners of the name input. The 8× crops show matching
contours; the third column makes the exact changed-pixel positions visible.

The earlier old-versus-old key control happened to have zero changed pixels.
It is **not** claimed to reproduce this particular old-versus-new difference.
The conclusion here is limited to direct image observation plus the previously
measured identical geometry/computed styles: no substantive visible change was
seen; strict PNG equality is still false.

## Recording a new article

- [Original baseline, 1440 × 1380 full-page capture](baseline-form-article-new-1440.png)
- [Original candidate, 1440 × 1380 full-page capture](candidate-form-article-new-1440.png)
- [Raw absolute RGB difference, original size](form-article-new-1440.diff.png)
- [Two left-corner crops at 8× nearest-neighbor scale](form-article-new-1440.zoom8.png)

The original images show the same title, field order, two-column date/mode
layout, blank text areas, actions, focus outline and underlying synthetic table.
No shift, wrap, font, clipping or content change is visible. All 45 changed pixels
are confined to a three-pixel-wide strip of rounded select/input border edges;
maximum channel difference is one. The 8× crops retain matching edge positions.
The earlier old-versus-old **full-page** control had zero changed pixels; its
viewport control varied. That distinction is retained and is not generalized
into a claim that every difference was reproduced by old-versus-old controls.

## Reading the evidence

In each zoom PNG, columns are **baseline / candidate / nonzero-difference map**.
Each row is one region listed in the manifest. Original pixels are enlarged
with nearest-neighbor sampling; the difference column maps any nonzero change
to 255 for visibility. This amplification is an analysis aid, not the magnitude
of the actual visual change. The separate `.diff.png` retains the real 0–1 RGB
channel differences without amplification, filtering or masking.

The executor opened all four full original images, both original-size raw
absolute differences and both enlarged crop panels using the image viewer.
These observations support “no substantive visible layout/style change seen”;
they do not mark strict PNG equality or the overall byte/line targets passed.

Privacy review: originals contain blank form values and clearly synthetic
account/article labels only. No password input, Cookie, CSRF value, access token,
one-time credential or real user/business data is visible. The credential has
not been created in these captures. All eight PNGs expose no metadata keys;
no network/session metadata is embedded. No browser was rerun and no product
code, stylesheet or pixel threshold was changed for this sign-off.
