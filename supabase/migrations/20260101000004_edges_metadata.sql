-- Edge attributes for the bipartite extractor graph: traversal weight and the
-- robot capability profiles allowed on an edge (see docs / graph/types.ts).
-- Additive and nullable — existing rows default to '{}' and the engine ignores it.

alter table public.edges
  add column if not exists metadata jsonb not null default '{}'::jsonb;

-- api_load_graph must now surface edges.metadata to external (API-key) clients.
create or replace function public.api_load_graph(
  p_api_key    text,
  p_project_id uuid
)
returns json
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  v_user := public.api_key_owner(p_api_key);
  if v_user is null then
    return null;
  end if;
  if not exists (
    select 1 from public.projects
    where id = p_project_id and user_id = v_user
  ) then
    return null;
  end if;

  return json_build_object(
    'nodes', (
      select coalesce(json_agg(row_to_json(n)), '[]'::json)
      from (
        select id, type, name, description, floor, pos_x, pos_y, metadata
        from public.nodes
        where project_id = p_project_id
      ) n
    ),
    'edges', (
      select coalesce(json_agg(row_to_json(e)), '[]'::json)
      from (
        select id, source, target, type, certain, metadata
        from public.edges
        where project_id = p_project_id
      ) e
    )
  );
end;
$$;
