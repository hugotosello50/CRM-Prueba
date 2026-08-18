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
-- INSTRUCTIVO PASO A PASO PARA ACTIVARLO (una sola vez). No hace falta saber
-- de sistemas, son todo clics — seguí los pasos en orden, del 1 al 6.
--
-- ── PASO 1: conseguir el dominio de la app en Vercel ────────────────────────
-- 1. Entrá a vercel.com e iniciá sesión con tu cuenta.
-- 2. Hacé clic en el proyecto de este CRM (la lista de proyectos aparece
--    apenas entrás).
-- 3. Arriba de la pantalla del proyecto vas a ver un link que termina en
--    ".vercel.app" (por ejemplo "mi-crm.vercel.app"). Copiá o anotá esa
--    parte — la vas a necesitar en el Paso 4.
--
-- ── PASO 2: cargar las 3 claves en Vercel ───────────────────────────────────
-- 1. Todavía dentro del proyecto en Vercel, hacé clic en la pestaña
--    "Settings" (arriba).
-- 2. En el menú de la izquierda, hacé clic en "Environment Variables".
-- 3. Vas a ver un formulario con dos campos: "Key" (nombre) y "Value"
--    (valor). Cargá estas 3, una por una — en cada una: pegás el nombre en
--    "Key", el valor en "Value", dejás tildados los 3 entornos (Production,
--    Preview, Development) y hacés clic en "Save". Repetir 3 veces:
--
--    Key:   NEXT_PUBLIC_VAPID_PUBLIC_KEY
--    Value: BGEBlLvvShveL6910kwVed5mHBt8OagSF3rVixkgECnq_Y3Hz0HHWC4fmQJ_VTRNMiEUhkpYl4z6LHlpnDYySz8
--
--    Key:   VAPID_PRIVATE_KEY
--    Value: 1MbfFZCX5cenK5k6A0OagpEi-lVPW8_8RrAjexUZ6Fg
--
--    Key:   AVISOS_CRON_SECRET
--    Value: T5M6Ed3DIUdCeShADTcQiYwzyPJVAEe1
--
-- (Estos 3 valores ya están generados y listos para usar tal cual están acá
-- arriba — no hay que inventarlos ni generarlos de nuevo vos.)
--
-- ── PASO 3: volver a publicar la app para que tome las claves nuevas ───────
-- 1. En el mismo proyecto de Vercel, pestaña "Deployments".
-- 2. En el despliegue de más arriba (el más reciente), hacé clic en los 3
--    puntitos "..." de la derecha → "Redeploy" → confirmá con el botón
--    "Redeploy" del cuadro que aparece.
-- 3. Esperá a que diga "Ready" (un par de minutos).
--
-- ── PASO 4: correr el SQL en Supabase ───────────────────────────────────────
-- 1. Entrá a supabase.com, elegí tu proyecto de este CRM.
-- 2. En el menú de la izquierda, "SQL Editor".
-- 3. Botón "New query".
-- 4. Copiá y pegá el bloque de SQL que sigue después de este comentario
--    (desde "create table if not exists public.push_subscriptions" hasta
--    el final del archivo).
-- 5. ANTES de ejecutarlo: buscá en el texto pegado la palabra "TU-DOMINIO"
--    (aparece una sola vez, dentro de una línea que dice "url :=") y
--    reemplazala por el dominio que copiaste en el Paso 1 — sin sacar las
--    comillas ni el "https://" que ya está puesto. Por ejemplo, si tu
--    dominio es "mi-crm.vercel.app", tiene que quedar así:
--      url := 'https://mi-crm.vercel.app/api/avisos/check',
-- 6. Hacé clic en "Run" (o Ctrl+Enter / Cmd+Enter).
--
-- ── PASO 5: activar los avisos en cada celular ──────────────────────────────
-- 1. Abrí la app desde el ícono que tenés instalado en la pantalla de
--    inicio (no desde el navegador suelto).
-- 2. Menú ☰ (arriba) → Configuración.
-- 3. Buscá la sección "Avisos" y tocá "Activar avisos en este dispositivo".
-- 4. El celular te va a pedir permiso para mandar notificaciones — tocá
--    "Permitir".
-- 5. Repetí este Paso 5 en cada celular/dispositivo donde quieras recibir
--    avisos — se activa por dispositivo, no una sola vez para toda la
--    cuenta.
--
-- ── PASO 6: probarlo ─────────────────────────────────────────────────────
-- 1. Cargá o editá un seguimiento o tarea con fecha y hora de acá a 10-15
--    minutos.
-- 2. Tildá el checkbox "Avisar" y dejá "30 minutos antes" o poné algo
--    chico, tipo "5 minutos antes".
-- 3. Guardá y esperá — la revisión corre sola cada 5 minutos, así que
--    puede tardar hasta 5 minutos en aparecer el aviso aunque ya haya
--    llegado el momento.
--
-- Si algo no funciona en cualquiera de estos pasos, avisale a Claude con el
-- número de paso y lo que ves en pantalla.

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
