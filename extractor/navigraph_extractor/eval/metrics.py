"""Evaluation metrics: region count, per-region IoU, and edge precision/recall.

Compares a predicted ExtractedGraph against an EvalSample. Pure (numpy/OpenCV),
so it is unit-tested with synthetic samples and needs no dataset. Edge metrics
compare *room-to-room* connectivity (passages collapsed) against the ground-truth
traversable adjacency.
"""

from __future__ import annotations

from dataclasses import dataclass

import cv2
import numpy as np

from ..schema import ExtractedGraph
from .sample import EvalSample


@dataclass(frozen=True)
class EvalResult:
    name: str
    n_pred_regions: int
    n_gt_rooms: int
    mean_iou: float
    edge_precision: float
    edge_recall: float
    edge_f1: float


def poly_to_mask(polygon: list[tuple[float, float]], shape: tuple[int, int]) -> np.ndarray:
    mask = np.zeros(shape, dtype=np.uint8)
    if len(polygon) >= 3:
        pts = np.array([[round(x), round(y)] for (x, y) in polygon], dtype=np.int32)
        cv2.fillPoly(mask, [pts], 255)
    return mask


def iou(a: np.ndarray, b: np.ndarray) -> float:
    inter = int(np.count_nonzero((a > 0) & (b > 0)))
    union = int(np.count_nonzero((a > 0) | (b > 0)))
    return inter / union if union else 0.0


def match_rooms(
    pred_masks: list[np.ndarray], gt_masks: list[np.ndarray]
) -> tuple[dict[int, int], float]:
    """Greedy 1:1 matching by IoU. Returns (pred_idx -> gt_idx, mean IoU over GT)."""
    pairs: list[tuple[float, int, int]] = []
    for i, pm in enumerate(pred_masks):
        for j, gm in enumerate(gt_masks):
            v = iou(pm, gm)
            if v > 0:
                pairs.append((v, i, j))
    pairs.sort(reverse=True)

    matching: dict[int, int] = {}
    used_pred: set[int] = set()
    used_gt: set[int] = set()
    iou_by_gt: dict[int, float] = {}
    for v, i, j in pairs:
        if i in used_pred or j in used_gt:
            continue
        matching[i] = j
        used_pred.add(i)
        used_gt.add(j)
        iou_by_gt[j] = v

    mean_iou = (
        sum(iou_by_gt.get(j, 0.0) for j in range(len(gt_masks))) / len(gt_masks)
        if gt_masks
        else 0.0
    )
    return matching, mean_iou


def predicted_room_adjacency(graph: ExtractedGraph) -> set[tuple[str, str]]:
    """Room-to-room adjacency implied by shared passages (passages collapsed)."""
    passage_spaces: dict[str, list[str]] = {}
    space_ids = {n.id for n in graph.nodes if n.kind == "space"}
    for e in graph.edges:
        if e.target not in space_ids:  # target is the passage, source the space
            passage_spaces.setdefault(e.target, []).append(e.source)
    adj: set[tuple[str, str]] = set()
    for spaces in passage_spaces.values():
        uniq = sorted(set(spaces))
        for a_i in range(len(uniq)):
            for b_i in range(a_i + 1, len(uniq)):
                adj.add((uniq[a_i], uniq[b_i]))
    return adj


def evaluate(sample: EvalSample, graph: ExtractedGraph) -> EvalResult:
    shape = sample.gray.shape[:2]
    h, w = shape

    spaces = [n for n in graph.nodes if n.kind == "space"]
    pred_masks = [
        poly_to_mask([(x * w, y * h) for (x, y) in n.polygon], shape) for n in spaces
    ]
    gt_masks = [poly_to_mask(r.polygon, shape) for r in sample.gt_rooms]

    matching, mean_iou = match_rooms(pred_masks, gt_masks)

    # Translate predicted adjacency (space ids) into GT room indices via matching.
    pred_index_by_id = {n.id: i for i, n in enumerate(spaces)}
    pred_adj_gt: set[tuple[int, int]] = set()
    for a_id, b_id in predicted_room_adjacency(graph):
        ai, bi = pred_index_by_id.get(a_id), pred_index_by_id.get(b_id)
        if ai is None or bi is None:
            continue
        ga, gb = matching.get(ai), matching.get(bi)
        if ga is None or gb is None:
            continue
        pred_adj_gt.add((min(ga, gb), max(ga, gb)))

    gt_edges = {(min(i, j), max(i, j)) for (i, j) in sample.gt_edges}
    tp = len(pred_adj_gt & gt_edges)
    fp = len(pred_adj_gt - gt_edges)
    fn = len(gt_edges - pred_adj_gt)
    precision = tp / (tp + fp) if (tp + fp) else 0.0
    recall = tp / (tp + fn) if (tp + fn) else 0.0
    f1 = (2 * precision * recall / (precision + recall)) if (precision + recall) else 0.0

    return EvalResult(
        name=sample.name,
        n_pred_regions=len(spaces),
        n_gt_rooms=len(sample.gt_rooms),
        mean_iou=mean_iou,
        edge_precision=precision,
        edge_recall=recall,
        edge_f1=f1,
    )
