-- Neon Postgres: esquema MVP TecRural aguacate virtual
create table if not exists parcela (
  id uuid primary key default gen_random_uuid(),
  nombre text not null default 'Mi parcela Almunecar',
  lat double precision not null default 36.733,
  lon double precision not null default -3.69,
  municipio_id text not null default '18001',
  variedad text not null default 'Hass',
  edad_anios numeric not null default 8,
  suelo_tipo text not null default 'franco',
  suelo_util_mm numeric not null default 90,
  riego_tipo text not null default 'goteo',
  marco_x_m numeric not null default 5.0,
  marco_y_m numeric not null default 5.0,
  fraccion_mojada numeric not null default 0.45,
  eficiencia_aplicacion numeric not null default 0.90,
  created_at timestamptz default now()
);
create table if not exists escenario (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid references parcela(id) on delete cascade,
  nombre text not null,
  riego_mm_dia jsonb not null,
  created_at timestamptz default now()
);
create table if not exists simulacion (
  id uuid primary key default gen_random_uuid(),
  escenario_id uuid references escenario(id) on delete cascade,
  fecha date not null default current_date,
  reservas_mm jsonb not null,
  estados jsonb not null,
  cosecha_posible jsonb,
  cosecha_probable jsonb,
  fuentes jsonb,
  created_at timestamptz default now()
);
create table if not exists observacion (
  id uuid primary key default gen_random_uuid(),
  parcela_id uuid references parcela(id) on delete cascade,
  fecha date not null default current_date,
  tipo text not null, -- humedad_suelo, riego_real, estado_visual, cosecha_real_kg
  valor numeric not null,
  nota text,
  created_at timestamptz default now()
);
create table if not exists registro_simulacion (
  id text primary key,
  version_modelo text not null,
  entradas text not null,
  resultados text not null,
  created_at text not null
);
create table if not exists registro_observacion (
  id text primary key,
  fecha text not null,
  tipo text not null, -- riego_real_mm | lluvia_real_mm | humedad_suelo_mm | fase | sintoma
  valor_num real,
  texto text,
  nota text,
  creado text not null
);
create table if not exists vinculo_recuperacion (
  token text primary key,
  email text not null,
  registro_id text not null,
  creado text not null,
  expira text not null,
  usado integer not null default 0
);
create table if not exists eventos (
  id integer generated always as identity primary key,
  evento text not null,
  sesion text not null,
  creado text not null
);
-- Parcela demo Almunecar
insert into parcela (nombre, lat, lon, municipio_id, variedad, edad_anios, suelo_tipo, riego_tipo)
values ('Demo Almunecar Hass adulto', 36.733, -3.69, '18001', 'Hass', 8, 'franco', 'goteo');
