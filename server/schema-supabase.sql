-- =============================================================================
-- AstroZenit: schemat dla Supabase
-- =============================================================================
--
-- Wersja skrócona względem server/schema.sql, i to jest sedno sprawy.
--
-- Supabase prowadzi własną tabelę auth.users razem z obsługą sesji, potwierdzania
-- adresu i odzyskiwania hasła. Nasze tabele users, sessions, tokens i auth_events
-- byłyby drugim, niespójnym rejestrem tego samego i prędzej czy później rozjechałyby
-- się z tamtym. Dlatego ich tu nie ma.
--
-- Zostają wyłącznie tabele z treścią, której Supabase nie zna: ulubione, zgody
-- na dokumenty i wpisy aktualności.
--
-- Uruchomienie: w panelu Supabase zakładka SQL Editor, wklej całość, Run.

-- =============================================================================
-- ULUBIONE
-- =============================================================================

create table public.favourites (
  user_id     uuid not null references auth.users (id) on delete cascade,

  -- Odwołanie w postaci rodzaj:identyfikator, na przykład planeta:jowisz,
  -- gwiazda:hip91262, messier:m31.
  object_ref  text not null check (object_ref ~ '^[a-z]+:[a-z0-9_-]+$'),

  label       text not null check (char_length(label) between 1 and 120),
  kind        text not null check (char_length(kind) between 1 and 16),
  note        text check (char_length(note) <= 500),
  observed_at date,
  created_at  timestamptz not null default now(),

  primary key (user_id, object_ref)
);

create index favourites_recent_idx on public.favourites (user_id, created_at desc);

-- =============================================================================
-- ZGODY NA DOKUMENTY
-- =============================================================================

create table public.consents (
  id          bigserial primary key,
  user_id     uuid references auth.users (id) on delete set null,
  document    text not null check (document in ('regulamin', 'prywatnosc')),
  version     text not null check (char_length(version) between 1 and 20),
  accepted_at timestamptz not null default now()
);

create index consents_user_idx on public.consents (user_id, document, accepted_at desc);

-- =============================================================================
-- OCHRONA WIERSZY
-- =============================================================================
--
-- TO JEST NAJWAŻNIEJSZA CZĘŚĆ TEGO PLIKU.
--
-- Supabase wystawia bazę wprost do przeglądarki: klucz publiczny projektu jest w kodzie
-- strony i każdy może go odczytać. Bez ochrony wierszy dowolna osoba mogłaby pobrać
-- ulubione wszystkich użytkowników jednym zapytaniem, i nie byłby to atak, tylko zwykłe
-- użycie interfejsu zgodnie z tym, co pozwala.
--
-- Ochrona wierszy przenosi decyzję o dostępie z aplikacji do bazy. Zasady poniżej mówią,
-- że użytkownik widzi i zmienia wyłącznie własne wiersze, i baza pilnuje tego niezależnie
-- od tego, co wyśle przeglądarka.

alter table public.favourites enable row level security;
alter table public.consents enable row level security;

-- auth.uid() to identyfikator zalogowanego, wyciągany z żetonu przez samą bazę.
-- Przeglądarka nie ma jak go podmienić, bo żeton jest podpisany.

create policy "wlasne ulubione do odczytu"
  on public.favourites for select
  using (auth.uid() = user_id);

create policy "wlasne ulubione do dopisania"
  on public.favourites for insert
  with check (auth.uid() = user_id);

create policy "wlasne ulubione do zmiany"
  on public.favourites for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "wlasne ulubione do usuniecia"
  on public.favourites for delete
  using (auth.uid() = user_id);

-- Zgody wolno dopisać i przeczytać własne, ale nie wolno ich zmieniać ani kasować.
-- Zgoda, którą da się cofnąć przez skasowanie wiersza, nie jest dowodem niczego.

create policy "wlasne zgody do odczytu"
  on public.consents for select
  using (auth.uid() = user_id);

create policy "wlasne zgody do dopisania"
  on public.consents for insert
  with check (auth.uid() = user_id);

-- =============================================================================
-- SPRAWDZENIE
-- =============================================================================
--
-- Po uruchomieniu warto potwierdzić, że ochrona jest włączona. Zapytanie poniżej
-- musi zwrócić true przy obu tabelach. Jeżeli zwróci false, dane są publiczne.

-- select relname, relrowsecurity from pg_class
-- where relname in ('favourites', 'consents');
