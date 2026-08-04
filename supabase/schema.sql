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
