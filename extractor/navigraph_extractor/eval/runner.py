"""Run the pipeline on eval samples and aggregate metrics."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

import cv2

from ..config import ExtractorParams
from ..labeling.base import Labeler
from ..labeling.mock import MockLabeler
from ..pipeline import extract_graph
from .metrics import EvalResult, evaluate
from .sample import EvalSample


def evaluate_sample(
    sample: EvalSample,
    params: Optional[ExtractorParams] = None,
    labeler: Optional[Labeler] = None,
) -> EvalResult:
    """Run the extraction pipeline on a sample's image and score it."""
    params = params or ExtractorParams()
    labeler = labeler or MockLabeler()
    ok, buf = cv2.imencode(".png", sample.gray)
    if not ok:
        raise ValueError("failed to encode sample image")
    graph = extract_graph(buf.tobytes(), params, labeler)
    return evaluate(sample, graph)


@dataclass(frozen=True)
class Aggregate:
    n: int
    mean_iou: float
    edge_precision: float
    edge_recall: float
    edge_f1: float
    region_count_ratio: float  # mean predicted/GT region count

    def to_dict(self) -> dict:
        return {
            "n": self.n,
            "mean_iou": round(self.mean_iou, 4),
            "edge_precision": round(self.edge_precision, 4),
            "edge_recall": round(self.edge_recall, 4),
            "edge_f1": round(self.edge_f1, 4),
            "region_count_ratio": round(self.region_count_ratio, 4),
        }


def aggregate(results: list[EvalResult]) -> Aggregate:
    n = len(results)
    if n == 0:
        return Aggregate(0, 0.0, 0.0, 0.0, 0.0, 0.0)

    def mean(xs: list[float]) -> float:
        return sum(xs) / n

    ratios = [
        (r.n_pred_regions / r.n_gt_rooms) if r.n_gt_rooms else 0.0 for r in results
    ]
    return Aggregate(
        n=n,
        mean_iou=mean([r.mean_iou for r in results]),
        edge_precision=mean([r.edge_precision for r in results]),
        edge_recall=mean([r.edge_recall for r in results]),
        edge_f1=mean([r.edge_f1 for r in results]),
        region_count_ratio=mean(ratios),
    )
