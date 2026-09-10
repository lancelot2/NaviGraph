-- NaviGraph storage buckets.
--
--  plans  — uploaded floor-plan images (one per project).
--  photos — reference photos attached to nodes for localization.
--
-- Both are private; the app serves them through short-lived signed URLs.
-- Objects are keyed as "<user_id>/<project_id>/..." so ownership is enforced by
-- matching the first path segment to the caller's uid.

insert into storage.buckets (id, name, public)
values ('plans', 'plans', false), ('photos', 'photos', false)
on conflict (id) do nothing;

create policy "plans_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'plans' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "photos_owner_all" on storage.objects
  for all to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'photos' and (storage.foldername(name))[1] = auth.uid()::text);
