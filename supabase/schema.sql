-- =====================================================================
-- Calendário de Treinos — banco no Supabase
-- Rode este arquivo inteiro uma vez em: Supabase → SQL Editor → New query
-- (pode rodar de novo sem problema: ele recria funções e regras)
--
-- Quem pode o quê (garantido pelo próprio banco, Row Level Security):
--   • Treinador: cria/edita/exclui só as atletas e treinos dele.
--   • Atleta (com login próprio, vinculada por convite): só LÊ o plano dela
--     e só registra "como foi" (tabela results). Não altera treinos.
--   • Visitante sem login: não acessa nada.
-- =====================================================================

-- ---------- Tabelas ----------
create table if not exists public.athletes (
  id              text primary key check (id ~ '^[A-Za-z0-9-]{1,40}$'),
  owner_id        uuid not null default auth.uid() references auth.users(id) on delete cascade,
  athlete_user_id uuid references auth.users(id) on delete set null,
  name            text not null check (char_length(name) between 1 and 60),
  zones           jsonb not null default '{}'::jsonb check (jsonb_typeof(zones) = 'object' and pg_column_size(zones) < 2000),
  invite_code     text unique check (invite_code ~ '^[a-z0-9]{12,40}$'),
  sort            int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- provas e fases do plano (a atleta só lê)
alter table public.athletes add column if not exists plan jsonb not null default '{}'::jsonb
  check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) < 50000);

create table if not exists public.workouts (
  id          text primary key check (id ~ '^[A-Za-z0-9-]{1,40}$'),
  athlete_id  text not null references public.athletes(id) on delete cascade,
  date        date not null,
  sport       text not null check (sport in ('run', 'bike', 'swim')),
  title       text not null default '' check (char_length(title) <= 80),
  duration    int not null default 0 check (duration between 0 and 2000),
  distance    numeric not null default 0 check (distance between 0 and 1000000),
  zone        text not null default '' check (zone in ('', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5')),
  description text not null default '' check (char_length(description) <= 5000),
  notes       text not null default '' check (char_length(notes) <= 2000),
  sort        int not null default 0,
  updated_at  timestamptz not null default now()
);
create index if not exists workouts_athlete_date on public.workouts (athlete_id, date);
-- treino em blocos (aquecimento, repetições, desaquecimento...)
alter table public.workouts add column if not exists steps jsonb
  check (steps is null or (jsonb_typeof(steps) = 'array' and pg_column_size(steps) < 20000));

create table if not exists public.results (
  workout_id text primary key references public.workouts(id) on delete cascade,
  done       boolean not null default false,
  duration   int not null default 0 check (duration between 0 and 2000),
  distance   numeric not null default 0 check (distance between 0 and 1000000),
  rpe        int not null default 0 check (rpe between 0 and 10),
  comment    text not null default '' check (char_length(comment) <= 1000),
  updated_by uuid default auth.uid(),
  updated_at timestamptz not null default now()
);

create table if not exists public.libraries (
  owner_id   uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  items      jsonb not null default '[]'::jsonb check (jsonb_typeof(items) = 'array' and pg_column_size(items) < 500000),
  updated_at timestamptz not null default now()
);

-- ---------- updated_at / updated_by automáticos ----------
create or replace function public.touch() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  if tg_table_name = 'results' then new.updated_by := auth.uid(); end if;
  return new;
end $$;

drop trigger if exists athletes_touch on public.athletes;
create trigger athletes_touch before insert or update on public.athletes for each row execute function public.touch();
drop trigger if exists workouts_touch on public.workouts;
create trigger workouts_touch before insert or update on public.workouts for each row execute function public.touch();
drop trigger if exists results_touch on public.results;
create trigger results_touch before insert or update on public.results for each row execute function public.touch();
drop trigger if exists libraries_touch on public.libraries;
create trigger libraries_touch before insert or update on public.libraries for each row execute function public.touch();

-- ---------- Funções auxiliares das regras ----------
-- security definer: consultam athletes sem cair em recursão das próprias regras
create or replace function public.is_coach_of(a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes where id = a and owner_id = auth.uid());
$$;

create or replace function public.is_athlete_of(a text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from athletes where id = a and athlete_user_id = auth.uid());
$$;

create or replace function public.athlete_of_workout(w text) returns text
language sql stable security definer set search_path = public as $$
  select athlete_id from workouts where id = w;
$$;

-- ---------- Row Level Security ----------
alter table public.athletes  enable row level security;
alter table public.workouts  enable row level security;
alter table public.results   enable row level security;
alter table public.libraries enable row level security;

-- athletes
drop policy if exists athletes_select on public.athletes;
create policy athletes_select on public.athletes for select to authenticated
  using (owner_id = auth.uid() or athlete_user_id = auth.uid());
drop policy if exists athletes_insert on public.athletes;
create policy athletes_insert on public.athletes for insert to authenticated
  with check (owner_id = auth.uid() and athlete_user_id is null);
drop policy if exists athletes_update on public.athletes;
create policy athletes_update on public.athletes for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
drop policy if exists athletes_delete on public.athletes;
create policy athletes_delete on public.athletes for delete to authenticated
  using (owner_id = auth.uid());

-- workouts: treinador escreve; atleta vinculada só lê
drop policy if exists workouts_select on public.workouts;
create policy workouts_select on public.workouts for select to authenticated
  using (public.is_coach_of(athlete_id) or public.is_athlete_of(athlete_id));
drop policy if exists workouts_insert on public.workouts;
create policy workouts_insert on public.workouts for insert to authenticated
  with check (public.is_coach_of(athlete_id));
drop policy if exists workouts_update on public.workouts;
create policy workouts_update on public.workouts for update to authenticated
  using (public.is_coach_of(athlete_id)) with check (public.is_coach_of(athlete_id));
drop policy if exists workouts_delete on public.workouts;
create policy workouts_delete on public.workouts for delete to authenticated
  using (public.is_coach_of(athlete_id));

-- results: treinador e atleta vinculada leem e escrevem
drop policy if exists results_all on public.results;
create policy results_all on public.results for all to authenticated
  using (public.is_coach_of(public.athlete_of_workout(workout_id)) or public.is_athlete_of(public.athlete_of_workout(workout_id)))
  with check (public.is_coach_of(public.athlete_of_workout(workout_id)) or public.is_athlete_of(public.athlete_of_workout(workout_id)));

-- libraries: só o dono
drop policy if exists libraries_all on public.libraries;
create policy libraries_all on public.libraries for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

-- ---------- Permissões por coluna ----------
-- Visitante (anon) não acessa nada.
revoke all on public.athletes, public.workouts, public.results, public.libraries from anon;
-- O treinador não pode escolher dono nem vincular uma conta qualquer como atleta:
-- owner_id vem sempre do login e athlete_user_id só muda pelo convite (claim_invite).
revoke insert, update on public.athletes from authenticated;
grant select, delete on public.athletes to authenticated;
grant insert (id, name, zones, invite_code, sort, plan) on public.athletes to authenticated;
grant update (name, zones, invite_code, sort, plan) on public.athletes to authenticated;
grant select, insert, update, delete on public.workouts, public.libraries to authenticated;
-- results: updated_by é sempre preenchido pelo banco (gatilho), não pelo app
revoke insert, update on public.results from authenticated;
grant select, delete on public.results to authenticated;
grant insert (workout_id, done, duration, distance, rpe, comment) on public.results to authenticated;
grant update (workout_id, done, duration, distance, rpe, comment) on public.results to authenticated;

-- ---------- Convite ----------
-- A atleta (logada) usa o código do convite para se vincular ao plano.
create or replace function public.claim_invite(code text)
returns table (id text, name text)
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'É preciso entrar na conta'; end if;
  return query
    update athletes a
       set athlete_user_id = auth.uid(), invite_code = null
     where a.invite_code = lower(code) and a.athlete_user_id is null
       and a.owner_id <> auth.uid()   -- o treinador não usa o convite da própria atleta
     returning a.id, a.name;
end $$;

-- O treinador desfaz o vínculo (ex.: a atleta trocou de conta).
create or replace function public.unlink_athlete(a text) returns void
language plpgsql security definer set search_path = public as $$
begin
  update athletes set athlete_user_id = null where id = a and owner_id = auth.uid();
end $$;

revoke all on function public.claim_invite(text), public.unlink_athlete(text),
  public.is_coach_of(text), public.is_athlete_of(text), public.athlete_of_workout(text) from public, anon;
grant execute on function public.claim_invite(text), public.unlink_athlete(text),
  public.is_coach_of(text), public.is_athlete_of(text), public.athlete_of_workout(text) to authenticated;
