-- NaviGraph schema — tables, indexes, and row-level security.
--
-- Reconstructed as the canonical, checked-in source of truth for the database
-- so a fresh clone (local `supabase start`, or self-hosting) creates a working
-- backend. Every table is owned by an auth.users row and isolated by RLS.

create extension if not exists vector;

-- Embedding dimension. Kept in sync with EMBEDDING_DIM in
-- src/lib/graph/types.ts and the bundle format spec.
-- (512 = OpenAI text-embedding-3-small at reduced dimensions.)

-- Buildings. A project owns one floor-plan image and one spatial graph.
create table if not exists public.projects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  name       text not null,
  plan_path  text,
  created_at timestamptz not null default now()
);

-- Places in the building (rooms, entrances, stairs, elevators, landmarks).
-- The graph is purely topological: pos_x/pos_y are canvas coordinates and
-- `floor` is the storey. Photo-derived semantics and the plan delimitation
-- live in `metadata` (jsonb).
create table if not exists public.nodes (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references public.projects (id) on delete cascade,
  type        text not null,
  name        text,
  description text,
  floor       integer not null default 0,
  pos_x       double precision not null default 0,
  pos_y       double precision not null default 0,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

-- Connections between places. Treated as bidirectional for navigation.
create table if not exists public.edges (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  source     uuid not null references public.nodes (id) on delete cascade,
  target     uuid not null references public.nodes (id) on delete cascade,
  type       text not null,
  certain    boolean not null default true,
  created_at timestamptz not null default now()
);

-- Reference photos for a place, with a precomputed embedding of the scene used
-- for camera-frame localization (pgvector nearest neighbor).
create table if not exists public.photos (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects (id) on delete cascade,
  node_id      uuid references public.nodes (id) on delete cascade,
  storage_path text not null,
  embedding    vector(512),
  created_at   timestamptz not null default now()
);

-- API keys for external (robot / backend) access to POST /api/context.
create table if not exists public.api_keys (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users (id) on delete cascade,
  name         text,
  key          text not null unique,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists nodes_project_id_idx  on public.nodes (project_id);
create index if not exists edges_project_id_idx  on public.edges (project_id);
create index if not exists photos_project_id_idx on public.photos (project_id);
create index if not exists api_keys_key_idx       on public.api_keys (key);

-- Approximate-nearest-neighbor index for localization (cosine distance).
create index if not exists photos_embedding_idx
  on public.photos using ivfflat (embedding vector_cosine_ops) with (lists = 100);

-- ---------------------------------------------------------------------------
-- Row-level security. A user sees and mutates only their own rows; child rows
-- are scoped through their parent project's ownership.
-- ---------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.nodes    enable row level security;
alter table public.edges    enable row level security;
alter table public.photos   enable row level security;
alter table public.api_keys enable row level security;

create policy "projects_owner_all" on public.projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "nodes_owner_all" on public.nodes
  for all
  using (exists (select 1 from public.projects p
                 where p.id = nodes.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = nodes.project_id and p.user_id = auth.uid()));

create policy "edges_owner_all" on public.edges
  for all
  using (exists (select 1 from public.projects p
                 where p.id = edges.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = edges.project_id and p.user_id = auth.uid()));

create policy "photos_owner_all" on public.photos
  for all
  using (exists (select 1 from public.projects p
                 where p.id = photos.project_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.projects p
                      where p.id = photos.project_id and p.user_id = auth.uid()));

create policy "api_keys_owner_all" on public.api_keys
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
