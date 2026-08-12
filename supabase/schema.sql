-- Run this once in the Supabase project's SQL editor (Database > SQL Editor).
-- Creates one row per user holding their CRM data as JSON, isolated by Row Level Security.

create table if not exists public.crm_data (
  user_id uuid primary key references auth.users(id) on delete cascade,
  core jsonb not null,
  acciones jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.crm_data enable row level security;

create policy "Users can view own crm data"
  on public.crm_data for select
  using (auth.uid() = user_id);

create policy "Users can insert own crm data"
  on public.crm_data for insert
  with check (auth.uid() = user_id);

create policy "Users can update own crm data"
  on public.crm_data for update
  using (auth.uid() = user_id);

-- Habilita Realtime sobre esta tabla: así, cuando un dispositivo guarda un cambio,
-- los demás dispositivos abiertos con la misma cuenta lo reciben solos y actualizan
-- su copia local, sin que el usuario tenga que refrescar manualmente.
alter publication supabase_realtime add table public.crm_data;

-- Guarda el access/refresh token de Google Contacts por usuario. A propósito NO tiene
-- políticas para los roles "anon"/"authenticated" — con RLS activado y sin políticas,
-- solo el service role (usado exclusivamente por las API routes del servidor, nunca por
-- el navegador) puede leer o escribir acá. Son tokens sensibles, no deben ser accesibles
-- desde el cliente.
create table if not exists public.google_contacts_tokens (
  user_id uuid primary key references auth.users(id) on delete cascade,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  updated_at timestamptz not null default now()
);

alter table public.google_contacts_tokens enable row level security;

-- ---------------------------------------------------------------------------
-- Adjuntos de hilos (Seguimientos y Tareas): PDF, imágenes, Excel, Word.
--
-- INSTRUCCIONES: pegá todo este bloque (desde "insert into storage.buckets"
-- hasta el final del archivo) en el SQL Editor de tu proyecto Supabase
-- (Database > SQL Editor) y ejecutalo una sola vez. No hace falta crear el
-- bucket a mano desde la sección "Storage" del dashboard, este SQL ya lo crea.
--
-- Qué hace:
-- 1) Crea el bucket "adjuntos", privado (nadie puede acceder sin estar
--    autenticado), con un límite de 25 MB por archivo y restringido a los
--    tipos de archivo que la app permite subir (PDF, imágenes, Excel, Word).
-- 2) Crea 3 políticas de seguridad (RLS) sobre ese bucket: cada usuario solo
--    puede ver, subir y borrar los archivos que están dentro de SU PROPIA
--    carpeta. La app guarda cada archivo bajo la ruta
--    "<user_id>/<id_del_hilo>/<archivo>", así que estas políticas alcanzan
--    para que nadie pueda ver ni tocar los archivos de otro usuario.
--
-- La metadata de cada adjunto (nombre, tamaño, fecha, ruta en el bucket) se
-- guarda dentro del hilo correspondiente, en la misma fila jsonb de
-- "crm_data" de arriba — no hace falta ninguna tabla nueva para eso.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'adjuntos',
  'adjuntos',
  false,
  26214400, -- 25 MB
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Users can view own adjuntos"
  on storage.objects for select
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can upload own adjuntos"
  on storage.objects for insert
  with check (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "Users can delete own adjuntos"
  on storage.objects for delete
  using (bucket_id = 'adjuntos' and (storage.foldername(name))[1] = auth.uid()::text);
