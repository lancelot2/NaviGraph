"""Étape 6 — dump annotated PNGs for every pipeline stage.

    python -m navigraph_extractor.dump plan.png --out debug_out/

Writes 01_binarization, 02_regions, 03_passages, 04_graph. Useful for iterating
on the CV and as demo material. Uses the mock labeler by default.
"""

from __future__ import annotations

import argparse
import os
from typing import Optional

from . import debug
from .config import ExtractorParams
from .graph import build_graph
from .image_io import load
from .labeling.base import Labeler
from .labeling.mock import MockLabeler
from .labeling.orchestrate import label_passages, label_regions
from .passages import detect_passages
from .preprocess import preprocess
from .regions import extract_regions


def dump_stages(
    image_bytes: bytes,
    out_dir: str,
    params: Optional[ExtractorParams] = None,
    labeler: Optional[Labeler] = None,
) -> list[str]:
    """Run the pipeline and write one annotated PNG per stage. Returns the paths."""
    params = params or ExtractorParams()
    labeler = labeler or MockLabeler()
    os.makedirs(out_dir, exist_ok=True)

    loaded = load(image_bytes, params.target_long_side)
    gray = loaded.gray
    shape = gray.shape[:2]

    pre = preprocess(gray, params)
    regions = extract_regions(pre.free, params)
    candidates = detect_passages(regions, shape, params, source=gray)
    region_labels = label_regions(gray, regions, labeler, params)
    passage_labels = label_passages(candidates, labeler)
    graph = build_graph(regions, candidates, region_labels, passage_labels, shape, params)

    written: list[str] = []

    def _write(name: str, image) -> None:
        path = os.path.join(out_dir, name)
        debug.save_png(path, image)
        written.append(path)

    _write("01_binarization.png", debug.render_binarization(pre))
    _write("02_regions.png", debug.render_regions(gray, regions))
    _write("03_passages.png", debug.render_passage_candidates(gray, regions, candidates))
    _write("04_graph.png", debug.render_graph(gray, graph))
    return written


def main(argv: Optional[list[str]] = None) -> None:
    parser = argparse.ArgumentParser(
        prog="navigraph_extractor.dump",
        description="Write annotated PNGs for each extraction stage.",
    )
    parser.add_argument("image", help="path to a floor-plan image")
    parser.add_argument("--out", default="debug_out", help="output directory")
    args = parser.parse_args(argv)

    with open(args.image, "rb") as fh:
        data = fh.read()
    for path in dump_stages(data, args.out):
        print(path)


if __name__ == "__main__":
    main()
