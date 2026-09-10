"""Evaluation CLI.

    python -m navigraph_extractor.eval --dataset resplan --n 200 --data ResPlan.pkl

Runs the extraction pipeline over N plans and reports region/IoU/edge metrics
against the ground-truth graph. --update-baseline writes eval/baseline.json;
otherwise the run is compared to it to catch regressions.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from typing import Optional

from ..config import ExtractorParams
from .runner import Aggregate, aggregate, evaluate_sample

_BASELINE = os.path.join(os.path.dirname(__file__), "baseline.json")


def _load_samples(dataset: str, data: Optional[str], n: Optional[int]):
    if dataset != "resplan":
        raise SystemExit(f"unknown dataset {dataset!r}")
    if not data:
        raise SystemExit(
            "provide --data <path to ResPlan.pkl> (install extras: pip install -e '.[eval]')"
        )
    from .resplan import load_samples

    return list(load_samples(data, n=n))


def main(argv: Optional[list[str]] = None) -> None:
    ap = argparse.ArgumentParser(prog="navigraph_extractor.eval")
    ap.add_argument("--dataset", default="resplan")
    ap.add_argument("--data", default=None, help="path to the dataset (e.g. ResPlan.pkl)")
    ap.add_argument("--n", type=int, default=200)
    ap.add_argument("--baseline", default=_BASELINE)
    ap.add_argument("--update-baseline", action="store_true")
    ap.add_argument("--wall-close-ksize", type=int, default=0)
    ap.add_argument("--k-from-walls", action="store_true")
    args = ap.parse_args(argv)

    params = ExtractorParams(
        wall_close_ksize=args.wall_close_ksize,
        passage_k_from_walls=args.k_from_walls,
    )
    samples = _load_samples(args.dataset, args.data, args.n)
    results = [evaluate_sample(s, params) for s in samples]
    agg = aggregate(results)

    print(f"dataset={args.dataset} n={agg.n}")
    for k, v in agg.to_dict().items():
        print(f"  {k}: {v}")

    if args.update_baseline:
        with open(args.baseline, "w", encoding="utf-8") as fh:
            json.dump(
                {
                    "dataset": args.dataset,
                    "n": agg.n,
                    "params": {
                        "wall_close_ksize": args.wall_close_ksize,
                        "passage_k_from_walls": args.k_from_walls,
                    },
                    "metrics": agg.to_dict(),
                },
                fh,
                indent=2,
            )
        print(f"baseline written to {args.baseline}")
        return

    _compare_baseline(args.baseline, agg)


def _compare_baseline(path: str, agg: Aggregate) -> None:
    if not os.path.exists(path):
        print("(no baseline; run with --update-baseline to record one)")
        return
    with open(path, encoding="utf-8") as fh:
        baseline = json.load(fh)
    base = baseline.get("metrics")
    if not base:
        print("(baseline not yet populated)")
        return
    print("deltas vs baseline:")
    for key in ("mean_iou", "edge_precision", "edge_recall", "edge_f1"):
        cur = agg.to_dict().get(key, 0.0)
        prev = base.get(key, 0.0)
        print(f"  {key}: {cur:+.4f} (was {prev})  Δ={cur - prev:+.4f}")


if __name__ == "__main__":
    sys.exit(main())
