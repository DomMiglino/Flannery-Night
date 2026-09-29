-- Flannery Night shared backend
-- Supabase/PostgreSQL schema for public read-only site + player peer ratings.

create extension if not exists pgcrypto;

create table if not exists public.players (
  id text primary key,
  name text not null unique,
  role text not null check (role in ('P','DC','DL','CC','CL','PC')),
  nation_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.matches (
  id text primary key,
  match_date date not null,
  mvp_a text references public.players(id) on delete set null,
  mvp_b text references public.players(id) on delete set null,
  critica text references public.players(id) on delete set null,
  notes text not null default '',
  advanced_tracked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.match_players (
  match_id text not null references public.matches(id) on delete cascade,
  player_id text not null references public.players(id) on delete cascade,
  team char(1) not null check (team in ('A','B')),
  goals integer not null default 0 check (goals >= 0),
  own_goals integer not null default 0 check (own_goals >= 0),
  assists integer not null default 0 check (assists >= 0),
  shots_on_target integer not null default 0 check (shots_on_target >= 0),
  key_passes integer not null default 0 check (key_passes >= 0),
  dribbles integer not null default 0 check (dribbles >= 0),
  recoveries integer not null default 0 check (recoveries >= 0),
  duels_won integer not null default 0 check (duels_won >= 0),
  saves integer not null default 0 check (saves >= 0),
  primary key (match_id, player_id)
);

-- PINs are hashed. Raw PINs are never stored.
create table if not exists public.player_access (
  player_id text primary key references public.players(id) on delete cascade,
  pin_hash text not null,
  active boolean not null default true,
  updated_at timestamptz not null default now()
);

create table if not exists public.peer_votes (
  voter_id text not null references public.players(id) on delete cascade,
  target_id text not null references public.players(id) on delete cascade,
  vel_tuf smallint not null check (vel_tuf between 1 and 99),
  tir_pre smallint not null check (tir_pre between 1 and 99),
  pass_rin smallint not null check (pass_rin between 1 and 99),
  dri_rif smallint not null check (dri_rif between 1 and 99),
  dif_rea smallint not null check (dif_rea between 1 and 99),
  fis_pia smallint not null check (fis_pia between 1 and 99),
  updated_at timestamptz not null default now(),
  primary key (voter_id, target_id),
  check (voter_id <> target_id)
);

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.matches enable row level security;
alter table public.match_players enable row level security;
alter table public.player_access enable row level security;
alter table public.peer_votes enable row level security;
alter table public.admin_users enable row level security;

-- Everyone can read public season data.
drop policy if exists "public read players" on public.players;
create policy "public read players" on public.players for select using (true);

drop policy if exists "public read matches" on public.matches;
create policy "public read matches" on public.matches for select using (true);

drop policy if exists "public read match players" on public.match_players;
create policy "public read match players" on public.match_players for select using (true);

-- Admin helper.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

grant execute on function public.is_admin() to authenticated;

-- Admin write policies for season data.
drop policy if exists "admin manage players" on public.players;
create policy "admin manage players" on public.players
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin manage matches" on public.matches;
create policy "admin manage matches" on public.matches
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "admin manage match players" on public.match_players;
create policy "admin manage match players" on public.match_players
for all to authenticated
using (public.is_admin())
with check (public.is_admin());

-- Public clients cannot read raw PIN hashes or individual votes.
revoke all on public.player_access from anon, authenticated;
revoke all on public.peer_votes from anon, authenticated;
grant select on public.players, public.matches, public.match_players to anon, authenticated;

-- Player PIN verification.
create or replace function public.verify_player_pin(p_player_id text, p_pin text)
returns boolean
language sql
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.player_access pa
    join public.players p on p.id = pa.player_id
    where pa.player_id = p_player_id
      and pa.active
      and p.active
      and pa.pin_hash = crypt(p_pin, pa.pin_hash)
  );
$$;

grant execute on function public.verify_player_pin(text,text) to anon, authenticated;

-- Insert/update exactly one vote per voter -> target.
create or replace function public.submit_peer_vote(
  p_voter_id text,
  p_pin text,
  p_target_id text,
  p_vel_tuf integer,
  p_tir_pre integer,
  p_pass_rin integer,
  p_dri_rif integer,
  p_dif_rea integer,
  p_fis_pia integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_voter_id = p_target_id then
    raise exception 'Non puoi votare te stesso';
  end if;

  if not public.verify_player_pin(p_voter_id, p_pin) then
    raise exception 'Identificazione non valida';
  end if;

  if not exists (select 1 from public.players where id = p_target_id and active) then
    raise exception 'Giocatore non valido';
  end if;

  if p_vel_tuf not between 1 and 99
     or p_tir_pre not between 1 and 99
     or p_pass_rin not between 1 and 99
     or p_dri_rif not between 1 and 99
     or p_dif_rea not between 1 and 99
     or p_fis_pia not between 1 and 99 then
    raise exception 'I voti devono essere compresi tra 1 e 99';
  end if;

  insert into public.peer_votes(
    voter_id,target_id,vel_tuf,tir_pre,pass_rin,dri_rif,dif_rea,fis_pia,updated_at
  )
  values(
    p_voter_id,p_target_id,p_vel_tuf,p_tir_pre,p_pass_rin,p_dri_rif,p_dif_rea,p_fis_pia,now()
  )
  on conflict (voter_id,target_id) do update set
    vel_tuf = excluded.vel_tuf,
    tir_pre = excluded.tir_pre,
    pass_rin = excluded.pass_rin,
    dri_rif = excluded.dri_rif,
    dif_rea = excluded.dif_rea,
    fis_pia = excluded.fis_pia,
    updated_at = now();
end;
$$;

grant execute on function public.submit_peer_vote(
  text,text,text,integer,integer,integer,integer,integer,integer
) to anon, authenticated;

-- Return only anonymous aggregates.
create or replace function public.get_peer_rating_averages()
returns table (
  player_id text,
  voters bigint,
  vel_tuf numeric,
  tir_pre numeric,
  pass_rin numeric,
  dri_rif numeric,
  dif_rea numeric,
  fis_pia numeric,
  overall numeric
)
language sql
stable
security definer
set search_path = public
as $$
  with a as (
    select
      p.id as player_id,
      p.role,
      count(v.voter_id) as voters,
      avg(v.vel_tuf)::numeric(5,1) as vel_tuf,
      avg(v.tir_pre)::numeric(5,1) as tir_pre,
      avg(v.pass_rin)::numeric(5,1) as pass_rin,
      avg(v.dri_rif)::numeric(5,1) as dri_rif,
      avg(v.dif_rea)::numeric(5,1) as dif_rea,
      avg(v.fis_pia)::numeric(5,1) as fis_pia
    from public.players p
    left join public.peer_votes v on v.target_id = p.id
    where p.active
    group by p.id,p.role
  )
  select
    player_id, voters, vel_tuf, tir_pre, pass_rin, dri_rif, dif_rea, fis_pia,
    case
      when voters = 0 then null
      when role='P'  then round(.25*vel_tuf + .15*tir_pre + .10*pass_rin + .25*dri_rif + .10*dif_rea + .15*fis_pia,1)
      when role='DC' then round(.15*vel_tuf + .00*tir_pre + .10*pass_rin + .05*dri_rif + .40*dif_rea + .30*fis_pia,1)
      when role='DL' then round(.20*vel_tuf + .00*tir_pre + .15*pass_rin + .05*dri_rif + .30*dif_rea + .30*fis_pia,1)
      when role='CC' then round(.15*vel_tuf + .15*tir_pre + .30*pass_rin + .15*dri_rif + .15*dif_rea + .10*fis_pia,1)
      when role='CL' then round(.30*vel_tuf + .10*tir_pre + .20*pass_rin + .25*dri_rif + .05*dif_rea + .10*fis_pia,1)
      when role='PC' then round(.20*vel_tuf + .40*tir_pre + .05*pass_rin + .15*dri_rif + .00*dif_rea + .20*fis_pia,1)
    end as overall
  from a;
$$;

grant execute on function public.get_peer_rating_averages() to anon, authenticated;

-- Admin-only convenience function to set/reset a player's PIN.
create or replace function public.admin_set_player_pin(p_player_id text, p_pin text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Non autorizzato';
  end if;
  if length(p_pin) < 4 then
    raise exception 'PIN troppo corto';
  end if;
  insert into public.player_access(player_id,pin_hash,active,updated_at)
  values(p_player_id, crypt(p_pin, gen_salt('bf')), true, now())
  on conflict(player_id) do update set
    pin_hash=excluded.pin_hash,
    active=true,
    updated_at=now();
end;
$$;

grant execute on function public.admin_set_player_pin(text,text) to authenticated;
