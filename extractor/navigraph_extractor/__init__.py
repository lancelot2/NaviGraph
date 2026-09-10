"""navigraph-extractor — deterministic floor-plan geometry, LLM only for labels.

Pipeline (see the project plan):
  1. preprocess   — grayscale, resolution normalization, binarization, text removal
  2. regions      — connected components of free space -> room polygons (pure)
  3. passages     — morphological dilation overlap -> passage candidates (pure)
  4. labeling     — the only non-deterministic step (LLM; mock available)
  5. graph        — bipartite space<->passage graph (pure)

Steps 1, 2, 3, 5 are pure and offline-testable.
"""

from __future__ import annotations

__version__ = "0.1.0"
