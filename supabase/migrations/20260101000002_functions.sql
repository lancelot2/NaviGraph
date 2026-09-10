-- NaviGraph RPCs.
--
--  match_location      — in-app localization under the caller's session (RLS).
--  api_load_graph      — external graph read, authenticated by an API key.
--  api_match_location  — external localization, authenticated by an API key.
--
-- The two api_* functions are SECURITY DEFINER: they validate the API key and
-- project ownership themselves, so external robots can call them with no
-- Supabase session. match_location is SECURITY INVOKER and relies on RLS.

-- Nearest reference photo to an embedding, within one project (session/RLS).
-- Embedding is passed as a JSON array string and cast to a pgvector.
create or replace function public.match_location(
  p_project_id uuid,
  p_embedding  text
)
returns table (node_id uuid, distance double precision)
language sql
stable
as $$
  select p.node_id, (p.embedding <=> p_embedding::vector) as distance
  from public.photos p
  where p.project_id = p_project_id
    and p.embedding is not null
    and p.node_id is not null
  order by p.embedding <=> p_embedding::vector
  limit 1;
$$;

-- Resolve the user_id that owns an API key, updating its last-used timestamp.
-- Returns null for an unknown key. SECURITY DEFINER so it can read api_keys.
create or replace function public.api_key_owner(p_api_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user uuid;
begin
  select user_id into v_user from public.api_keys where key = p_api_key;
  if v_user is null then
    return null;
  end if;
  update public.api_keys set last_used_at = now() where key = p_api_key;
  return v_user;
end;
$$;

-- Full graph for a project, authenticated by an API key. Returns null when the
-- key is invalid or does not own the project (the caller maps that to an error).
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
        select id, source, target, type, certain
        from public.edges
        where project_id = p_project_id
      ) e
    )
  );
end;
$$;

-- Nearest reference photo's node id for a project, authenticated by an API key.
-- Returns null when the key/project is invalid or nothing matches.
create or replace function public.api_match_location(
  p_api_key    text,
  p_project_id uuid,
  p_embedding  text
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user    uuid;
  v_node_id uuid;
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

  select p.node_id into v_node_id
  from public.photos p
  where p.project_id = p_project_id
    and p.embedding is not null
    and p.node_id is not null
  order by p.embedding <=> p_embedding::vector
  limit 1;

  return v_node_id::text;
end;
$$;

-- match_location runs in the caller's session; api_* validate keys internally.
grant execute on function public.match_location(uuid, text) to authenticated;
grant execute on function public.api_load_graph(text, uuid) to anon, authenticated;
grant execute on function public.api_match_location(text, uuid, text) to anon, authenticated;
-- api_key_owner is a helper for the definer functions only; not callable directly.
revoke execute on function public.api_key_owner(text) from public, anon, authenticated;
