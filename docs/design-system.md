# Wildlife ID — Design System

Distilled from the design handoff in `docs/design/`. Read the original HTML/JSX for the most accurate specs; this doc captures the authoritative tokens and patterns so they stay close to the code.

The visual identity is **warm cream paper, sage accent, serif headlines**. It should feel like a field notebook, not a productivity SaaS.

---

## 1. Colors

Use as CSS custom properties at the document root.

```scss
:root {
  /* surfaces */
  --bg-room:    #efece4;   /* desktop behind the window */
  --bg-room-2:  #e5e1d6;
  --bg-app:     #fbfaf6;   /* app canvas */
  --bg-card:    #ffffff;

  /* text */
  --ink:    #1f2220;       /* primary */
  --ink-2:  #4b4f4b;       /* secondary */
  --ink-3:  #7a7f7a;       /* tertiary, captions */
  --ink-4:  #aeb1ab;       /* quaternary, hints */

  /* hairlines */
  --hair:   rgba(18,22,20,0.08);
  --hair-2: rgba(18,22,20,0.14);

  /* accent (sage) */
  --accent:        #6a8566;
  --accent-deep:   #4f6a4c;
  --accent-soft:   #e5ede2;
  --accent-softer: #f1f5ee;

  --warn: #b8872b;
}
```

The "room" gradient sits at the body level: `radial-gradient(120% 80% at 50% -10%, #f5f2ea 0%, var(--bg-room) 55%, var(--bg-room-2) 100%)`. Inside the window, `--bg-app` is the canvas; cards sit on `--bg-card`.

---

## 2. Typography

Three families, loaded from Google Fonts:

| Family | Weights | Use |
|---|---|---|
| **Inter** | 300, 400, 450, 500, 600, 700 | UI text — buttons, labels, body |
| **Fraunces** | 400, 500, 600 (italic available) | Display — h1–h3, species names, results |
| **JetBrains Mono** | 400, 500 | Numbers — file sizes, percentages, timestamps |

System fallbacks: `-apple-system, BlinkMacSystemFont, "Helvetica Neue", sans-serif`.

Italic Fraunces is the carrier for scientific (Latin) names: *Vulpes vulpes*. When a common name and Latin name appear together, the common name uses the upright Fraunces in `--ink`, and the Latin name uses italic Fraunces in `--ink-3`.

---

## 4. Wordmark

Custom glyph + the words "Wildlife ID":

- **Glyph:** three concentric circles (lens / aperture metaphor). Outer ring stroked in `--accent-deep`, middle ring filled `--accent-soft` and stroked `--accent-deep`, inner dot filled `--accent-deep`. Sizes: 14 / 18 / 28px.
- **Text:** Fraunces 500. "Wildlife" in `--ink`, then a non-breaking space, then "ID" in italic with weight 400 and color `--accent-deep`.

Three sizes: `small` (14px) for the title bar, default (18px) for the sidebar, `large` (28px) for the welcome screen.

---

## 5. Buttons

Two buttons cover most surfaces:

**PrimaryButton** — sage green pill, 44px tall, 10px radius, white text.

```
background: var(--accent);
hover: #5c7658;
active: var(--accent-deep);
disabled: #c8ccc5;
shadow: 0 1px 0 rgba(255,255,255,0.2) inset,
        0 -1px 0 rgba(0,0,0,0.12) inset,
        0 1px 2px rgba(30,50,30,0.18),
        0 6px 16px -6px rgba(80,110,80,0.4);
```

**GhostButton** — transparent with hairline border, 44px tall, used for secondary actions.

```
border: 0.5px solid var(--hair-2);
hover background: rgba(0,0,0,0.03);
color: var(--ink-2);
```

Action buttons inside the result panel are slightly shorter (42px) and sit in a tight row.

---

## 6. Layout

**Welcome screen.** Two-column grid, `1.05fr 1fr`. Copy on the left (72px gutter, max-width 460px), decorative art panel on the right with topographic line pattern, mock photo card, and floating "Identified" result card.

**Model picker.** Vertical stack inside the window. Back button, step indicator (`1/2 dots`), header, two `ModelCard`s in a `1fr 1fr` grid, then the footer with the primary action.

**App shell.** Sidebar 200px wide on the left, main pane fills the rest. Sidebar background `#fbfaf6`, hairline left edge on the main pane (`border-left: 0.5px solid var(--hair)`).

Sidebar nav items: 30px tall, 7px radius, padding 0 10px, gap 10px between icon and label. Active item has `--accent-softer` background and `--accent-deep` text. The `Workspace` section header is 10px, weight 600, uppercase, letter-spacing 0.12em, in `--ink-4`.

Settings sits at the bottom of the sidebar, separated from the workspace items by a flex spacer.

---

## 7. Identify tab — state machine

Four stages:

```
empty → crop → identifying → result
                                ↓
                            (Identify another)
                                ↓
                              empty
```

**empty.** Drop zone + file picker + sample shortcuts. Background uses subtle dashed border on the drop area. Reads "Drop a photo here, or click to choose a file."

**crop.** The full image with a draggable / resizable crop rectangle, pre-set to the full image bounds. The crop ratio is unconstrained. Below the image, a primary "Identify" button and a secondary "Cancel" button.

**identifying.** Progress bar with four labeled checkpoints (Load model, Extract features, Match species, Rank candidates) animated as the model runs. Live percentage in JetBrains Mono. Privacy tagline at the bottom: "Nothing leaves your computer."

If the backend exposes Server-Sent Events for progress, drive the bar from those. Otherwise simulate the checkpoint timings client-side based on elapsed time — the exact stage labels are decorative, not load-bearing.

**result.** Single column:

1. **Eyebrow** — `Identified` with check icon, accent-deep, 11px, uppercase, letter-spaced 0.14em
2. **Common name** — Fraunces 500, 34px, `--ink`
3. **Scientific name** — Fraunces italic, 16px, `--ink-3`
4. **Confidence** — uppercase eyebrow + bar (height 8, radius 999) + percentage in Fraunces 22px
5. **Taxonomy chips** — light card (`#fbfaf6` background, hairline border, 8px radius, 12/14 padding), wraps Kingdom / Class / Family / Status as `[uppercase key] [value]` pairs
6. **Other possibilities** — top-3 alternates, each row is `species + Latin (italic) + small bar + percentage`
7. **Actions** — primary "Save to collection" full-flex + ghost "Identify another"

After save: the primary button switches to a darker sage (`--accent-deep`) with a check icon and reads "Saved to collection."

The IUCN conservation status is rendered as one of the taxonomy chips when the species has an assessment (`Status: Least Concern` etc.). When unavailable, omit the chip silently — don't render `Status: Unknown`.

---

## 8. Collection tab — anatomy

(See `docs/design/collection-tab.jsx` for full source.)

Grid of cards on the main canvas. Each card: thumbnail at the top, common name in Fraunces, Latin in italic Fraunces underneath, and a thin row of metadata (date observed, location). Cards are `--bg-card` with a subtle shadow. Filter and search controls sit in a header above the grid.

Detail view opens as either a side panel or full-page overlay (decide during implementation; either matches the design language). Editable fields: Date observed (free-text date), Location (free-text), Comments (multi-line).

---

## 9. Settings tab — anatomy

(See `docs/design/settings-tab.jsx`.)

A vertical list of sections: Model, About, with chunky cards for each. Bottom of the About section has three ghost buttons: **Acknowledgements**, **Open Source Licenses**, **Privacy**.

The design source still shows pre-MIT copy in places. When you implement the renderer, use the corrected text:

| In the design | Use instead |
|---|---|
| Welcome footer: "By continuing, you agree to the License Agreement" | "Open source under MIT — view license" linking to LICENSE on GitHub |
| Settings → "License agreement" button | "Open Source Licenses" (matches FR-17) |
| Settings → "Trained on the iNaturalist research-grade dataset and licensed under the Attribution-NonCommercial 4.0 International license" | "Powered by BioCLIP 2 (MIT). Trained on the TreeOfLife-200M dataset, which incorporates iNaturalist research-grade observations." |

The CC BY-NC line is incorrect — BioCLIP 2 is MIT-licensed (verified via Hugging Face). Keep the attribution to BioCLIP and the underlying dataset, but don't claim NC restrictions on the model.

---

## 10. Things in the handoff to ignore

- **`tweaks-panel.jsx`** — design-tool overlay only. Not part of the app.
- **`macos-window.jsx`** — generic macOS-Tahoe component library, not used by Wildlife ID. Ignore.
- **History tab and Field guide tab** — visible as sidebar items in the design but render `Not part of this design pass`. They are out of scope for v1; the v1 sidebar shows only Identify, Collection, and Settings.
- **The radial gradient on the body** — the `--bg-room` desktop is only meaningful in the prototype where the window floats on a faux desktop. In the real app the window IS the OS window, so this gradient never renders.

---

## 11. Things the design doesn't specify (decide during implementation)

- **Dark mode.** Not designed yet. Don't implement in v1; leave the architecture open to it (keep colors as custom properties, not hardcoded).
- **Empty state for Collection.** Show something friendly: small illustration or hairline-bordered card with "Save your first identification to start a collection." Match the warm-paper feel.
- **Error states inside Identify.** When `/predict` fails, replace the result panel with an inline error card that uses `--warn` for the icon and gives a Retry button.
- **Low-confidence warning copy.** Below the confidence bar when top result < 0.2: "Low confidence — try a tighter crop on just the animal." Use `--warn` for the icon, keep text in `--ink-2`.

---

The design's source files in `docs/design/` are canonical for anything not captured here. Reach for them when implementing a specific component — they have exact pixel values for things this doc summarizes.
