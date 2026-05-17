---
title: "Grid Composition — Three Field Counts"
description: "A test post exercising the grid editorial primitive (spec 02-A). Three discrete Mila-style field grids (8, 16, 32) with color fields, placeholder image cells, and one cross-primitive case."
pubDate: 2026-05-17
draft: true
tags: ["typography", "pilcrow", "test", "grid"]
dropCap: true
---

The Pilcrow grid composition primitive divides the post canvas into discrete fields and lets the author place text, images, and color fields into them. This is the first concrete example of the grid directive shipped in spec 02-A. Three discrete grids are supported: 32 fields (editorial), 16 fields (flexible), 8 fields (simple). The examples move from dense to restrained.

## Thirty-two fields — editorial, sparse

The thirty-two-field grid is a 4×8 matrix. This example places ten cells on a 32-field canvas — deliberate sparseness, not absence. Empty fields act as breathing room, anchoring the placed cells without crowding them. Use this grid when you want the density available but intend to compose with restraint.

::::grid{fields=32}

:::cell{id=1 colspan=4}

# Late Nights

:::

:::cell{id=2 colspan=2 kind=image alt="lamp casting amber light on a wooden side table"}
:::

:::cell{id=3 colspan=2}

A modern oasis for slow evenings. Featuring clean lines, plush cushioning, and a durable construction designed to last.

:::

:::cell{id=4 colspan=1 fill=accent}

28

:::

:::cell{id=5 colspan=3}

The classic chair, the epitome of style and comfort.

:::

:::cell{id=6 colspan=2 fill=muted}

Choose from a variety of colors and fabrics to create the perfect look for your home.

:::

:::cell{id=7 colspan=2 kind=image alt="leather armchair with tapered wooden legs"}
:::

:::cell{id=8 colspan=4 fill=rule}

A rhythm that feels intentional, warm, and quietly confident.

:::

:::cell{id=9 colspan=2}

Hoge Bank.

:::

:::cell{id=10 colspan=2 fill=accent}

7. Gouden Gloed.

:::

::::

## Sixteen fields — flexible, balanced

The sixteen-field grid is a 4×4 matrix. It supports more cells per row and is the brand-book's most-used spread. Image cells and color fields can share a row without crowding.

::::grid{fields=16}

:::cell{id=1 colspan=4}

# Mila — Modern Furniture

In a world filled with noise and constant stimulation, the spaces we live in have become more important than ever. A well-designed interior does not need to feel crowded or complicated to make an impression. Often, the most memorable spaces are the ones built on clarity, balance, and restraint.

:::

:::cell{id=2 colspan=2 kind=image alt="warm wooden bench in soft afternoon light"}
:::

:::cell{id=3 colspan=2}

Each piece is designed to bring calm into a room through thoughtful proportions, soft geometry, and a timeless visual language.

:::

:::cell{id=4 colspan=2 fill=muted}

A chair becomes more than a seat. A table becomes more than a surface.

:::

:::cell{id=5 colspan=2 kind=image alt="dining table with ceramic plates and natural-fibre placemats"}
:::

:::cell{id=6 colspan=4}

Together, these pieces create a rhythm that feels intentional, warm, and quietly confident. This approach is not about following trends — it is about creating furniture that feels relevant today and still feels right years from now.

:::

::::

## Eight fields — simple, calm

The eight-field grid is a 2×4 matrix. Use it for the calmest compositions — a few text fields anchored against generous breathing room.

::::grid{fields=8}

:::cell{id=1 colspan=2}

# The Art of Living with Less

:::

:::cell{id=2 colspan=1 rowspan=1 kind=image alt="modern dining room with thin black chairs"}
:::

:::cell{id=3 colspan=1 fill=muted}

A well-designed interior does not need to feel crowded or complicated to make an impression.

:::

:::cell{id=4 colspan=2}

Mila Modern Furniture is rooted in the idea that the most memorable spaces are the ones built on clarity, balance, and restraint.

:::

:::cell{id=5 colspan=2 kind=empty fill=rule}
:::

::::

## Cross-primitive — sidenote inside a cell

The primitives compose. A sidenote authored inside a grid cell rides in the page's right margin column — alongside the cell that anchors it, not buried inside the grid. Drop cap, grid, and sidenote occupy the same typeset page as a single composition.

:::::grid{fields=8}

::::cell{id=1 colspan=2}

The interior of a small room can be a stage.

:::sidenote
The metaphor of room-as-stage comes from Donald Norman, *The Design of Everyday Things*, third edition, page 142.
:::

Every chair, every table edge, every interval of empty wall participates in the composition the eye assembles.

::::

::::cell{id=2 colspan=2 fill=muted}

On wide viewports, the sidenote settles into the margin alongside this cell — the grid and the annotation are one composition, not two layers.

::::

:::::

That is the complete surface of spec 02-A. Cells use browser-native line wrapping until per-cell typesetting lands; the grid composition reads correctly either way.
