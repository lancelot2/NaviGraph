# Self-hosting NaviGraph

One command brings up the web app **and** a local Supabase (Postgres + pgvector,
Auth, PostgREST, Storage). No OpenAI key required — the app defaults to the mock
vision backend.

```bash
cd docker
cp .env.example .env      # demo credentials; change for anything networked
docker compose up --build
```

Then:

- App: <http://localhost:3000>
- Supabase API (gateway): <http://localhost:8000>

Sign up at `/login` (email auto-confirms locally), create a project, and a mock
graph is generated for you to edit and export.

## What's in the stack

| Service | Image | Role |
| --- | --- | --- |
| `db` | `supabase/postgres` | Postgres 15 with pgvector and the Supabase roles. |
| `auth` | `supabase/gotrue` | Email auth (`/auth/v1`). |
| `rest` | `postgrest/postgrest` | Database + RPC access (`/rest/v1`). |
| `storage` | `supabase/storage-api` | Plan/photo object storage (`/storage/v1`). |
| `gateway` | `nginx` | Multiplexes the above under `:8000`. |
| `migrate` | `supabase/postgres` | One-shot: applies `supabase/migrations/*.sql`. |
| `app` | built from `../Dockerfile` | The Next.js app. |

The `migrate` service waits until Auth and Storage have created their schemas,
then applies the NaviGraph migrations (tables, RLS, RPCs, storage buckets).

## Enabling real vision

```bash
# in docker/.env
VISION_PROVIDER=openai
OPENAI_API_KEY=sk-...
```

Only the app uses this; the rest of the stack is unaffected, and the offline SDK
path never needs it.

## Notes & caveats

- The credentials in `.env.example` are Supabase's **public demo** values. Rotate
  `POSTGRES_PASSWORD`, `JWT_SECRET`, and regenerate `ANON_KEY`/`SERVICE_ROLE_KEY`
  before exposing this anywhere.
- This is a trimmed, development-oriented stack (no realtime, edge functions,
  or image transformation — the app doesn't use them). For a hardened production
  Supabase, follow the upstream self-hosting guide.
- `NEXT_PUBLIC_*` values are baked into the app image at build time; the compose
  passes the demo values as build args. Rebuild (`docker compose build app`) if
  you change the Supabase URL or anon key.
