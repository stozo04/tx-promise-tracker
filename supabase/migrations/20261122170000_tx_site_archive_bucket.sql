insert into storage.buckets (id, name, public, file_size_limit)
values ('tx-site-archive', 'tx-site-archive', true, 104857600)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit;
