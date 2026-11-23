# Como ligar a nuvem (Supabase)

Leva uns 10 minutos e é feito uma vez só. O plano grátis do Supabase sobra para esse uso.

## 1. Criar o projeto

1. Entre em <https://supabase.com> e crie uma conta (pode ser com o GitHub).
2. **New project** → escolha um nome (ex.: `calendario-treinos`), crie uma senha do banco
   (guarde num lugar seguro; o site não usa essa senha) e a região **South America (São Paulo)**.
3. Espere o projeto terminar de criar (1–2 minutos).

## 2. Criar as tabelas e as regras de acesso

1. No menu do projeto: **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`schema.sql`](schema.sql) e clique **Run**.
3. Deve aparecer *Success. No rows returned*.

## 3. Ajustar o login

Em **Authentication → URL Configuration**:

- **Site URL**: `https://josivansm.github.io/calendario-treinos/`
- **Redirect URLs** → *Add URL*: `https://josivansm.github.io/calendario-treinos/**`
  (e, para testar no computador, `http://localhost:8010/**`)

Em **Authentication → Sign In / Providers → Email**: deixe **Email** ligado.
Com *Confirm email* ligado, cada pessoa confirma o email antes do primeiro acesso (recomendado).

> O plano grátis envia poucos emails por hora (confirmação e "esqueci a senha").
> Para duas ou três pessoas é suficiente.

## 4. Passar os dados do projeto para o site

Em **Project Settings → API** (ou no botão **Connect**), copie:

- **Project URL** (ex.: `https://abcdefghijklmnop.supabase.co`)
- a chave **anon public** (ou **publishable**, começa com `sb_publishable_`)

Essas duas são públicas por natureza e vão no arquivo [`js/config.js`](../js/config.js).
Quem protege os dados são as regras do passo 2.

**Nunca** use a chave `service_role` / `secret` no site.

## Como fica o uso

- **Você (treinador)**: abre o site, cria sua conta com email e senha. Se este navegador tiver
  treinos, o site oferece enviá-los para a conta. Depois disso tudo é salvo sozinho
  (aparece "✓ Salvo na nuvem" no topo).
- **Atleta**: em **Link da atleta** → o site gera um **convite**. Ela abre o link, cria a conta dela
  e passa a ver o plano sempre atualizado. O que ela marcar como feito aparece no seu calendário
  (ao voltar para a aba ou em até 1 minuto).
- O convite vale uma vez. Se ela trocar de conta, use **Desvincular conta** e gere outro.
