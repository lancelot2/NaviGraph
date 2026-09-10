# Contributing to NaviGraph

Thanks for your interest in improving NaviGraph. This project turns building
floor plans into portable semantic spatial graphs for robots, so contributions
from robotics, web, and ML engineers are all welcome.

## Ways to contribute

- **Report bugs** — open a GitHub issue with steps to reproduce, expected vs.
  actual behavior, and your environment (OS, Node version, Python version, ROS
  distro if relevant).
- **Propose changes** — for anything non-trivial, open an issue first so we can
  agree on the approach before you invest time.
- **Improve the spec** — the [spatial-graph bundle format](docs/spatial-graph-format.md)
  is a public specification. Corrections and clarifications are valuable.

## Project layout

This is a monorepo:

| Path | What it is |
| --- | --- |
| `src/`, `app/` | The Next.js web app (hosted builder + `/api/context`) |
| `supabase/` | Database schema and migrations |
| `sdk/python/` | The `navigraph` Python SDK (hosted + offline backends) |
| `ros2/` | The `navigraph_ros` ROS 2 node |
| `docker/` | Self-hosting (app + local Supabase) |
| `docs/` | Public specifications and reference docs |
| `examples/` | Runnable end-to-end examples |

## Development setup

### Web app

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

See the [README](README.md#self-host) for standing up a local Supabase
(schema lives in `supabase/migrations/`).

### Python SDK

```bash
cd sdk/python
python -m pip install -e ".[dev]"
pytest
```

## The parity contract (important)

The offline SDK path and the hosted `/api/context` path **must** produce
byte-identical `context` strings for the same graph and inputs. This is
enforced by a parity test that runs shared fixtures through both the TypeScript
and Python implementations of the context core.

If you change context-generation, destination resolution, text-based
localization, or path planning:

1. Change the logic in **both** `src/lib/engine/core.ts` and
   `sdk/python/navigraph/core.py`.
2. Regenerate/adjust the fixtures under `tests/fixtures/context/`.
3. Confirm `npm test` and `pytest` both pass, including the parity test.

A PR that changes one side without the other will fail CI by design.

## Coding standards

- **TypeScript**: `npm run lint` and `npm run typecheck` must pass. Match the
  existing style; keep changes surgical.
- **Python**: type hints and docstrings on public APIs; `pytest` must pass.
- Write tests alongside the change, not after.

## Commit and PR conventions

- Keep commits focused; write clear messages describing the "why".
- Reference the issue a PR closes.
- By contributing, you agree that your contributions are licensed under the
  project's [Apache License 2.0](LICENSE).

## Code of conduct

All participation is governed by our [Code of Conduct](CODE_OF_CONDUCT.md).
