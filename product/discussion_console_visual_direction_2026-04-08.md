# Discussion Console Visual Direction

## Purpose
This note captures the visual language now chosen for the floating discussion workbench so future UI edits do not drift.

---

## Chosen Mix

### Base Tone: Notion
- warm white background instead of cold white
- light borders instead of heavy panels
- minimal blue used only for the strongest CTA
- calm reading-first feeling

### Structure: Cal.com
- compact card rhythm
- clear separation between primary workspace and secondary controls
- restrained use of shadows
- clean, neutral action groupings

### Density: Linear
- chips and meta rows can be thinner
- support content should compress well
- status language should be short, precise, and consistent

---

## What To Avoid

- do not convert the whole workbench to a dark command palette aesthetic
- do not use multiple high-saturation accent colors
- do not let the right rail become a stack of equal-weight cards
- do not let explanatory text dominate the visible area

---

## Surface Guidance

- main panel surface: warm light neutral
- cards: slightly raised, whisper border
- separators: visible but low-contrast
- shadows: soft and shallow, not glassy or dramatic

---

## Typography Guidance

- headings should be compact and clear, not oversized
- body text should remain plain and readable
- chips, labels, and badges should be dense but not tiny
- avoid display-style typography inside the workbench

---

## Component Guidance

### Primary Button
- single blue CTA
- visually strongest element in the footer

### Secondary Buttons
- neutral or low-contrast surfaces
- never compete with the primary CTA

### Chips
- compact
- readable at a glance
- support summary scanning rather than decoration

### Cards
- subtle radius
- light borders
- enough padding to breathe, but no oversized empty space

### Progressive Disclosure
- the right rail should summarize by default and explain only after explicit expansion
- participant state should read as count first, detailed chips second
- lower-priority tools should collapse before footer actions lose visibility

### Low-Height Behavior
- when height gets tight, remove duplicated copy before shrinking actions
- keep the status band and footer readable longer than the decorative header copy
- footer may become a two-row action dock in low-height mode

---

## Copy Direction

- wording should feel as calm as the visuals
- prefer short, direct, systematic labels over explanatory sentences
- launcher copy should be shorter than expanded-panel copy
- footer status should say state first, next step second
- the right rail should use compressed chips and summaries, not mini paragraphs

Detailed rules now live in:

- `product/discussion_console_copy_guidelines_2026-04-08.md`
- `product/discussion_console_ui_acceptance_checklist_2026-04-08.md`

---

## Final Rule

When design decisions conflict, prefer:

1. draft readability
2. footer action stability
3. support information compression
4. decorative refinement

The workbench should feel like a precise writing and coordination surface, not a marketing showcase.
