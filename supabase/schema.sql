create table if not exists public.app_state (
  id text primary key,
  data jsonb not null,
  revision bigint not null default 1,
  updated_at timestamptz not null default now()
);

alter table public.app_state
add column if not exists revision bigint not null default 1;

create table if not exists public.app_backups (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  actor text,
  action text not null,
  detail text,
  payload jsonb,
  created_at timestamptz not null default now()
);

alter table public.app_state enable row level security;
alter table public.app_backups enable row level security;
alter table public.audit_events enable row level security;

drop policy if exists "panol_app_state_select" on public.app_state;
drop policy if exists "panol_app_state_insert" on public.app_state;
drop policy if exists "panol_app_state_update" on public.app_state;

create policy "panol_app_state_select"
on public.app_state
for select
to authenticated
using (id = 'panol-central-colegio-salesiano');

create policy "panol_app_state_insert"
on public.app_state
for insert
to authenticated
with check (id = 'panol-central-colegio-salesiano');

create policy "panol_app_state_update"
on public.app_state
for update
to authenticated
using (id = 'panol-central-colegio-salesiano')
with check (id = 'panol-central-colegio-salesiano');

drop policy if exists "panol_backups_select" on public.app_backups;
drop policy if exists "panol_backups_insert" on public.app_backups;
drop policy if exists "panol_audit_select" on public.audit_events;
drop policy if exists "panol_audit_insert" on public.audit_events;

create policy "panol_backups_select"
on public.app_backups
for select
to authenticated
using (true);

create policy "panol_backups_insert"
on public.app_backups
for insert
to authenticated
with check (true);

create policy "panol_audit_select"
on public.audit_events
for select
to authenticated
using (true);

create policy "panol_audit_insert"
on public.audit_events
for insert
to authenticated
with check (true);

-- Importante:
-- Con estas politicas, la app necesita Supabase Auth activo.
-- Crea usuarios en Authentication > Users y luego asigna sus permisos
-- desde Ajustes > Perfiles, usando el mismo email.
