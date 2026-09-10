"""Extraction parameters.

A single, validated config object threaded through the pure stages. Defaults are
conservative and are NOT tuned on the demo plans (see the plan's constraints).
Percent fields are expressed as percentages (0.2 == 0.2%), never pixels, so they
are resolution-independent.
"""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ExtractorParams(BaseModel):
    """Tunable parameters for the extraction pipeline."""

    model_config = {"extra": "forbid"}

    # --- Étape 1: preprocessing --------------------------------------------
    # Longest image side is normalized to this before any morphology, so that
    # kernel sizes (e.g. the passage dilation k) have a fixed pixel meaning.
    target_long_side: int = Field(default=512, ge=64, le=4096)

    binarization: Literal["otsu", "adaptive"] = "otsu"
    # Adaptive thresholding params (ignored for Otsu). block_size must be odd.
    adaptive_block_size: int = Field(default=35, ge=3)
    adaptive_c: int = 10

    # Optional morphological opening (kernel px on the 512-normalized image) to
    # drop thin strokes (dimension lines, hatching). 0 disables it.
    thin_line_open_ksize: int = Field(default=0, ge=0)

    # Optional morphological CLOSE (kernel px) that seals gaps in the walls —
    # doorways and small openings up to ~ksize — so adjacent rooms stay SEPARATE
    # free-space components in Étape 2 (and the interior stops leaking to the
    # exterior through open doors). 0 disables it. Tune on the eval set.
    wall_close_ksize: int = Field(default=0, ge=0)

    # Optional text / furniture glyph removal by connected components:
    # a component that is small (area <= text_max_area_pct of the image) AND
    # dense (filled fraction of its bbox >= text_min_fill) is masked out.
    remove_text: bool = False
    text_max_area_pct: float = Field(default=0.2, gt=0)
    text_min_fill: float = Field(default=0.5, ge=0, le=1)

    # --- Étape 2: region extraction ----------------------------------------
    # Free-space components smaller than this fraction of the whole image are
    # dropped (resolution-independent). Components touching the image border are
    # always dropped (that removes the building exterior).
    min_region_area_pct: float = Field(default=0.1, gt=0)
    # approxPolyDP epsilon as a fraction of each contour's perimeter.
    approx_epsilon_frac: float = Field(default=0.01, gt=0)

    # --- Étape 3: passage candidate detection ------------------------------
    # Dilation kernel for finding where two regions nearly touch. The paper uses
    # k=5 on 512px images; 0 means "derive from resolution" (k = 5 * long/512),
    # which matches k=5 once the image is normalized to target_long_side=512.
    passage_dilation_k: int = Field(default=0, ge=0)
    # Extra margin (px on the working image) around the overlap when cropping the
    # candidate thumbnail sent to the labeler.
    vignette_margin_px: int = Field(default=24, ge=0)

    # --- Étape 4: labeling -------------------------------------------------
    # Regions labeled below this confidence in the single whole-plan call are
    # re-labeled individually from a context-padded crop (fallback).
    region_conf_threshold: float = Field(default=0.5, ge=0, le=1)
    region_fallback_margin_px: int = Field(default=16, ge=0)

    # --- Étape 5: graph construction ---------------------------------------
    # An edge is "certain" when its passage classification is at least this
    # confident.
    passage_certain_threshold: float = Field(default=0.5, ge=0, le=1)
    # Narrow-passage penalty: a passage whose overlap min-side (working px) is
    # below this gets `narrow_passage_penalty` added to its edge weight. 0 = off.
    narrow_passage_px: int = Field(default=0, ge=0)
    narrow_passage_penalty: float = Field(default=0.0, ge=0)
