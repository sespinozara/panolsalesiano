-- Segunda etapa: tablas reales para reemplazar el estado JSON central.
-- Ejecutar solo cuando se migre el código a estas tablas.

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid,
  name text not null,
  username text unique not null,
  role text not null default 'usuario',
  permissions text[] not null default array['dashboard'],
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  rut text,
  course text,
  email text,
  phone text,
  created_at timestamptz not null default now()
);

create table if not exists public.teachers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  department text,
  email text,
  created_at timestamptz not null default now()
);

create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('material', 'herramienta')),
  name text not null,
  code text,
  category text,
  stock numeric not null default 0,
  min_stock numeric not null default 0,
  unit text,
  location text,
  status text,
  description text,
  created_at timestamptz not null default now()
);

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  requester_type text not null,
  requester_id text not null,
  requester_name text not null,
  requester_email text,
  department text,
  expected_date date,
  status text not null default 'pendiente',
  notes text,
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);

create table if not exists public.request_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.requests(id) on delete cascade,
  item_type text not null,
  item_id text not null,
  name text not null,
  code text,
  qty numeric not null default 1,
  non_returnable boolean not null default false
);

create table if not exists public.loans (
  id uuid primary key default gen_random_uuid(),
  source_request_id uuid,
  requester_type text not null,
  requester_id text not null,
  requester_name text not null,
  expected_return date,
  status text not null default 'activo',
  notes text,
  operator_name text,
  created_at timestamptz not null default now(),
  returned_at timestamptz
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  teacher_id text not null,
  teacher_name text not null,
  request_id text,
  request_title text,
  sender text not null,
  recipient text not null,
  body text not null,
  admin_read boolean not null default false,
  teacher_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.movements (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  type text not null,
  detail text not null,
  requester_name text,
  status text,
  operator_name text,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.teachers enable row level security;
alter table public.inventory_items enable row level security;
alter table public.requests enable row level security;
alter table public.request_items enable row level security;
alter table public.loans enable row level security;
alter table public.messages enable row level security;
alter table public.movements enable row level security;

