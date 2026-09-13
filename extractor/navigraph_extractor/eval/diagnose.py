"""Recall accounting: where do ground-truth edges go?

Decomposes each missed GT edge so tuning targets the right stage:
  * unmatched_merged   — a room wasn't matched because it merged into a neighbor
  * unmatched_missed   — a room had no good predicted overlap at all
  * matched_no_adjacency — both rooms matched, but NO passage was detected between
                           them (a genuine detector miss, not a metric artifact)
  * tp                 — recovered

Pure (given a sample + predicted graph), so it is unit-tested offline.
"""

from __future__ import annotations

from dataclasses import dataclass

from ..schema import ExtractedGraph
from .metrics import iou, match_rooms, poly_to_mask, predicted_room_adjacency
from .sample import EvalSample


@dataclass(frozen=True)
class RecallBreakdown:
    total: int
    tp: int
    unmatched_merged: int
    unmatched_missed: int
    matched_no_adjacency: int

    def __add__(self, other: "RecallBreakdown") -> "RecallBreakdown":
        return RecallBreakdown(
            self.total + other.total,
            self.tp + other.tp,
            self.unmatched_merged + other.unmatched_merged,
            self.unmatched_missed + other.unmatched_missed,
            self.matched_no_adjacency + other.matched_no_adjacency,
        )


_EMPTY = RecallBreakdown(0, 0, 0, 0, 0)


def recall_breakdown(sample: EvalSample, graph: ExtractedGraph) -> RecallBreakdown:
    h, w = sample.gray.shape[:2]
    spaces = [n for n in graph.nodes if n.kind == "space"]
    pred_masks = [
        poly_to_mask([(x * w, y * h) for (x, y) in n.polygon], (h, w)) for n in spaces
    ]
    gt_masks = [poly_to_mask(r.polygon, (h, w)) for r in sample.gt_rooms]

    matching, _ = match_rooms(pred_masks, gt_masks)  # pred_idx -> gt_idx
    gt_matched = set(matching.values())
    pred_index_by_id = {n.id: i for i, n in enumerate(spaces)}

    pred_adj_gt: set[tuple[int, int]] = set()
    for a_id, b_id in predicted_room_adjacency(graph):
        ga = matching.get(pred_index_by_id.get(a_id, -1))
        gb = matching.get(pred_index_by_id.get(b_id, -1))
        if ga is not None and gb is not None:
            pred_adj_gt.add((min(ga, gb), max(ga, gb)))

    def merged(gt_idx: int) -> bool:
        # Best-overlapping predicted region is already taken by another GT room.
        best_i, best_iou = -1, 0.0
        for i, pm in enumerate(pred_masks):
            v = iou(pm, gt_masks[gt_idx])
            if v > best_iou:
                best_iou, best_i = v, i
        return best_i in matching and best_iou > 0.1 and matching[best_i] != gt_idx

    total = tp = um_merged = um_missed = mna = 0
    for a, b in sample.gt_edges:
        total += 1
        if a in gt_matched and b in gt_matched:
            if (min(a, b), max(a, b)) in pred_adj_gt:
                tp += 1
            else:
                mna += 1
        else:
            if any(j not in gt_matched and merged(j) for j in (a, b)):
                um_merged += 1
            else:
                um_missed += 1
    return RecallBreakdown(total, tp, um_merged, um_missed, mna)


def aggregate_breakdown(items: list[RecallBreakdown]) -> RecallBreakdown:
    result = _EMPTY
    for it in items:
        result = result + it
    return result
