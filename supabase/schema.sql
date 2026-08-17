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
-- Adjuntos de hilos (Seguimientos y Tareas): cualquier tipo de archivo.
--
-- INSTRUCCIONES: pegá todo este bloque (desde "insert into storage.buckets"
-- hasta el final del archivo) en el SQL Editor de tu proyecto Supabase
-- (Database > SQL Editor) y ejecutalo una sola vez. No hace falta crear el
-- bucket a mano desde la sección "Storage" del dashboard, este SQL ya lo crea.
-- Si ya lo habías corrido antes con la versión vieja (que restringía a PDF/
-- imágenes/Excel/Word), volver a correr este bloque actualiza el bucket para
-- sacar esa restricción — no rompe nada, es seguro repetirlo.
--
-- Qué hace:
-- 1) Crea el bucket "adjuntos", privado (nadie puede acceder sin estar
--    autenticado), con un límite de 25 MB por archivo, sin restricción de
--    tipo de archivo.
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
  null -- sin restricción de tipo de archivo
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

-- ---------------------------------------------------------------------------
-- Avisos (notificaciones push) de Seguimientos y Tareas.
--
-- INSTRUCCIONES — hay 3 pasos, en orden:
--
-- PASO 1) Variables de entorno. Generá y agregá estas 3 en tu hosting (donde
-- ya tenés NEXT_PUBLIC_SUPABASE_URL, GOOGLE_CLIENT_SECRET, etc.) y en tu
-- .env.local si probás en tu máquina:
--   NEXT_PUBLIC_VAPID_PUBLIC_KEY = BGEBlLvvShveL6910kwVed5mHBt8OagSF3rVixkgECnq_Y3Hz0HHWC4fmQJ_VTRNMiEUhkpYl4z6LHlpnDYySz8
--   VAPID_PRIVATE_KEY            = 1MbfFZCX5cenK5k6A0OagpEi-lVPW8_8RrAjexUZ6Fg
--   AVISOS_CRON_SECRET           = T5M6Ed3DIUdCeShADTcQiYwzyPJVAEe1
-- (Ya generadas y listas para usar — son solo para esta app, no hace falta
-- generarlas de nuevo. VAPID_PRIVATE_KEY y AVISOS_CRON_SECRET son secretos,
-- nunca deben ir con el prefijo NEXT_PUBLIC_.)
--
-- PASO 2) Correr este bloque SQL (desde "create table push_subscriptions"
-- hasta el final del archivo) una sola vez en el SQL Editor de Supabase.
-- Crea la tabla donde se guarda qué dispositivos pueden recibir avisos, y
-- programa una tarea que corre sola cada 5 minutos revisando si hay algo
-- para avisar.
--
-- PASO 3) Antes de correr el bloque, reemplazá TU-DOMINIO más abajo (dentro
-- de la función cron.schedule) por el dominio real donde está publicada la
-- app (ej: "mi-crm.vercel.app"), sin "https://" en el resto de la URL ya
-- puesto. Y reemplazá también el secreto en el header Authorization por el
-- mismo valor que pusiste en AVISOS_CRON_SECRET en el paso 1.

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

alter table public.push_subscriptions enable row level security;

create policy "Users can view own push subscriptions"
  on public.push_subscriptions for select
  using (auth.uid() = user_id);

create policy "Users can insert own push subscriptions"
  on public.push_subscriptions for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own push subscriptions"
  on public.push_subscriptions for delete
  using (auth.uid() = user_id);

-- Habilita las extensiones necesarias para poder llamar a una URL (nuestra API route)
-- desde una tarea programada de Postgres.
create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'avisos-cada-5-min',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://TU-DOMINIO/api/avisos/check',
    headers := '{"Authorization": "Bearer T5M6Ed3DIUdCeShADTcQiYwzyPJVAEe1", "Content-Type": "application/json"}'::jsonb
  );
  $$
);

-- Para desactivar los avisos más adelante (si hiciera falta), correr en el SQL Editor:
-- select cron.unschedule('avisos-cada-5-min');
