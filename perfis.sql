-- Parte 1 do Supabase: tabela de perfis (nome de exibição, logo, plano).
-- Cole este arquivo inteiro no SQL Editor do Supabase e clique em "Run".
-- Pode rodar de uma vez só, é seguro repetir se der algum erro no meio.

-- 1) A tabela em si: uma linha por login. O "id" é o mesmo id que o
--    Supabase Auth já usa pra cada usuário (auth.users) — não criamos um id
--    novo, só "penduramos" mais informação nesse mesmo id.
create table if not exists public.perfis (
  id uuid primary key references auth.users (id) on delete cascade,
  nome_exibicao text not null default 'Seller',
  email text not null,
  logo_url text,
  plano text not null default 'Plano Essencial',
  criado_em timestamptz not null default now()
);

-- 2) Liga a segurança por linha: sem isso, qualquer pessoa com a chave
--    pública conseguiria ler/editar o perfil de qualquer outro seller.
alter table public.perfis enable row level security;

-- 3) As regras: cada seller só enxerga e só edita a própria linha.
drop policy if exists "cada um ve o proprio perfil" on public.perfis;
create policy "cada um ve o proprio perfil"
  on public.perfis for select
  using (auth.uid() = id);

drop policy if exists "cada um edita o proprio perfil" on public.perfis;
create policy "cada um edita o proprio perfil"
  on public.perfis for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- 4) Cria a linha de perfil automaticamente assim que alguém se cadastra
--    (não é o app que faz isso — é o próprio banco reagindo ao cadastro).
--    "security definer" é o que permite essa função escrever na tabela
--    mesmo com o RLS ligado.
create or replace function public.criar_perfil_ao_cadastrar()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.perfis (id, nome_exibicao, email)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'nome_exibicao', split_part(new.email, '@', 1)),
    new.email
  );
  return new;
end;
$$;

drop trigger if exists ao_cadastrar_criar_perfil on auth.users;
create trigger ao_cadastrar_criar_perfil
  after insert on auth.users
  for each row execute function public.criar_perfil_ao_cadastrar();
