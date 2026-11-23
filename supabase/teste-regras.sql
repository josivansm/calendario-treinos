-- Teste das regras de acesso (RLS). NÃO deixa nada salvo:
-- tudo roda dentro de um bloco que termina com erro de propósito, desfazendo as mudanças.
-- O resultado aparece na mensagem de erro: cada linha "OK" ou "FALHOU".
do $$
declare
  a uuid := '00000000-0000-4000-a000-00000000000a'; -- treinador A
  b uuid := '00000000-0000-4000-a000-00000000000b'; -- treinador B
  t uuid := '00000000-0000-4000-a000-00000000000c'; -- atleta
  rep text := '';
  n int;
  procedure_ok boolean;
begin
  insert into auth.users (id, email, aud, role, instance_id)
  values (a, 'treinador-a@teste.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
         (b, 'treinador-b@teste.invalid', 'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000'),
         (t, 'atleta@teste.invalid',      'authenticated', 'authenticated', '00000000-0000-0000-0000-000000000000');

  -- ===== Treinador A =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  insert into athletes (id, name, invite_code) values ('atA', 'Ana', 'convitetestea1234');
  insert into workouts (id, athlete_id, date, sport, title) values ('wA1', 'atA', '2026-11-24', 'run', 'Rodagem');
  select count(*) into n from athletes;
  rep := rep || E'\n' || case when n = 1 then 'OK' else 'FALHOU' end || ' · A vê a própria atleta';
  begin
    update athletes set athlete_user_id = t where id = 'atA';
    rep := rep || E'\nFALHOU · A conseguiu vincular uma conta qualquer';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · A não consegue vincular uma conta qualquer como atleta';
  end;
  begin
    insert into athletes (id, name, owner_id) values ('atX', 'X', b);
    rep := rep || E'\nFALHOU · A criou atleta em nome de B';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · A não cria atleta em nome de outro treinador';
  end;
  reset role;

  -- ===== Treinador B (não pode ver nem mexer no que é de A) =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from athletes;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · B não vê atletas de A';
  select count(*) into n from workouts;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · B não vê treinos de A';
  update workouts set title = 'hack' where id = 'wA1';
  get diagnostics n = row_count;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · B não altera treino de A';
  delete from athletes where id = 'atA';
  get diagnostics n = row_count;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · B não exclui atleta de A';
  begin
    insert into workouts (id, athlete_id, date, sport) values ('wB1', 'atA', '2026-11-25', 'run');
    rep := rep || E'\nFALHOU · B colocou treino na atleta de A';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · B não coloca treino na atleta de A';
  end;
  begin
    insert into results (workout_id, done) values ('wA1', true);
    rep := rep || E'\nFALHOU · B registrou resultado em treino de A';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · B não registra resultado em treino de A';
  end;
  reset role;

  -- ===== Atleta =====
  perform set_config('request.jwt.claims', json_build_object('sub', t, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from workouts;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · Atleta não vê nada antes do convite';
  select count(*) into n from claim_invite('codigo-errado-123');
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · Convite errado não funciona';
  select count(*) into n from claim_invite('convitetestea1234');
  rep := rep || E'\n' || case when n = 1 then 'OK' else 'FALHOU' end || ' · Convite certo vincula a atleta';
  select count(*) into n from workouts;
  rep := rep || E'\n' || case when n = 1 then 'OK' else 'FALHOU' end || ' · Atleta vê o treino depois do convite';
  update workouts set title = 'mudei' where id = 'wA1';
  get diagnostics n = row_count;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · Atleta não altera o treino';
  delete from workouts where id = 'wA1';
  get diagnostics n = row_count;
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · Atleta não exclui o treino';
  begin
    insert into workouts (id, athlete_id, date, sport) values ('wT1', 'atA', '2026-11-26', 'run');
    rep := rep || E'\nFALHOU · Atleta criou treino';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · Atleta não cria treino';
  end;
  insert into results (workout_id, done, rpe, comment) values ('wA1', true, 6, 'Foi bem');
  select count(*) into n from results where workout_id = 'wA1' and done;
  rep := rep || E'\n' || case when n = 1 then 'OK' else 'FALHOU' end || ' · Atleta marca o treino como feito';
  select count(*) into n from claim_invite('convitetestea1234');
  rep := rep || E'\n' || case when n = 0 then 'OK' else 'FALHOU' end || ' · Convite não pode ser usado de novo';
  reset role;

  -- ===== Treinador A vê o retorno =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  set local role authenticated;
  select count(*) into n from results where workout_id = 'wA1' and comment = 'Foi bem';
  rep := rep || E'\n' || case when n = 1 then 'OK' else 'FALHOU' end || ' · Treinador A vê o "como foi" da atleta';
  reset role;

  -- ===== Visitante sem login =====
  set local role anon;
  begin
    perform 1 from athletes;
    rep := rep || E'\nFALHOU · Visitante leu atletas';
  exception when insufficient_privilege then
    rep := rep || E'\nOK · Visitante sem login não lê nada';
  end;
  reset role;

  raise exception 'RESULTADO DO TESTE (nada foi salvo):%', rep;
end $$;
