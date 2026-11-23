'use strict';
/* =====================================================================
   Nuvem (Supabase): login, convite da atleta e sincronização.
   Usa as funções e o estado globais de app.js (db, readOnly, render...).
   Modos:
     'local'   → sem conta, dados só neste navegador (como antes)
     'coach'   → treinador logado: cada alteração é enviada para a nuvem
     'athlete' → atleta logada: vê o plano e registra "como foi"
   ===================================================================== */

const Cloud = {
  client: null,
  user: null,
  mode: 'local',
  synced: null,      // retrato do que já está na nuvem (para enviar só o que mudou)
  timer: null,
  retry: null,
  busy: false,
  dirty: false,
  refreshing: false,
};
const INVITE_KEY = 'calendario-treinos:convite';
const LOCAL_CHOICE_KEY = 'calendario-treinos:sem-conta';
const UI_KEY = 'calendario-treinos:ui';
const PAGE_URL = () => `${location.origin}${location.pathname}`;

const cloudEnabled = () =>
  !!(window.CLOUD_CONFIG && CLOUD_CONFIG.url && CLOUD_CONFIG.anonKey && window.supabase && window.supabase.createClient);

function lsGet(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* sem armazenamento */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch (e) { /* sem armazenamento */ } }

function loadUI() { try { return JSON.parse(lsGet(UI_KEY)) || {}; } catch (e) { return {}; } }
function saveUI() { lsSet(UI_KEY, JSON.stringify({ currentId: db.currentId, libraryOpen: !!db.libraryOpen })); }

/* ---------- Status na barra ---------- */
function setSyncStatus(state, detail) {
  const s = $('#syncStatus');
  if (!s) return;
  const map = {
    ok: ['✓ Salvo na nuvem', 'ok'],
    saving: ['Salvando…', 'saving'],
    error: ['⚠ Não salvou — tentando de novo', 'error'],
    loading: ['Carregando…', 'saving'],
    offline: ['⚠ Sem internet', 'error'],
  };
  const [text, cls] = map[state] || ['', ''];
  s.textContent = text;
  s.className = `sync ${cls}`;
  s.title = detail || '';
  s.hidden = !text;
}

/* ---------- Convite ---------- */
function captureInvite() {
  const params = new URLSearchParams(location.search);
  let code = params.get('convite');
  if (!code && location.hash.startsWith('#convite=')) code = location.hash.slice(9);
  if (code && /^[a-z0-9]{12,40}$/i.test(code)) lsSet(INVITE_KEY, code.toLowerCase());
  if (params.has('convite') || location.hash.startsWith('#convite=')) history.replaceState(null, '', location.pathname);
}
const pendingInvite = () => lsGet(INVITE_KEY);

function newInviteCode() {
  const bytes = new Uint8Array(12);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-4);
}

/* ---------- Conversão linha do banco ⇄ app ---------- */
const workoutRow = (w, athleteId) => ({
  id: w.id, athlete_id: athleteId, date: w.date, sport: w.sport, title: w.title,
  duration: w.duration, distance: w.distance, zone: w.zone, description: w.desc, notes: w.notes, sort: w.order, steps: w.steps || null,
});
const resultRow = w => ({
  workout_id: w.id, done: w.result.done, duration: w.result.duration, distance: w.result.distance,
  rpe: w.result.rpe, comment: w.result.comment,
});

function snapshot() {
  const s = { athletes: {}, workouts: {}, results: {}, library: JSON.stringify(db.library || []) };
  db.athletes.forEach((a, i) => {
    s.athletes[a.id] = JSON.stringify({ name: a.name, zones: sanitizeZones(a.zones), plan: sanitizePlan(a.plan), sort: i });
    a.workouts.forEach(w => {
      s.workouts[w.id] = JSON.stringify(workoutRow(w, a.id));
      if (w.result) s.results[w.id] = JSON.stringify(resultRow(w));
    });
  });
  return s;
}

/* ---------- Leitura ---------- */
async function fetchAll(makeQuery) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await makeQuery().range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

async function cloudFetch() {
  const c = Cloud.client;
  const uid = Cloud.user.id;
  const athletes = await fetchAll(() => c.from('athletes')
    .select('id,name,zones,plan,invite_code,athlete_user_id,owner_id,sort,created_at')
    .order('sort').order('created_at'));
  const ids = athletes.map(a => a.id);
  let workouts = [], results = [];
  if (ids.length) {
    workouts = await fetchAll(() => c.from('workouts').select('*').in('athlete_id', ids).order('date').order('sort'));
    results = await fetchAll(() => c.from('results').select('workout_id,done,duration,distance,rpe,comment'));
  }
  const { data: lib, error } = await c.from('libraries').select('items').eq('owner_id', uid).maybeSingle();
  if (error) throw error;

  const res = {};
  results.forEach(r => (res[r.workout_id] = r));
  const byAthlete = {};
  workouts.forEach(w => (byAthlete[w.athlete_id] = byAthlete[w.athlete_id] || []).push(w));
  const toAthlete = a => ({
    id: a.id,
    name: a.name,
    zones: sanitizeZones(a.zones),
    plan: sanitizePlan(a.plan),
    inviteCode: a.invite_code,
    linked: !!a.athlete_user_id,
    workouts: (byAthlete[a.id] || []).map(w => sanitizeWorkout({
      id: w.id, date: w.date, sport: w.sport, title: w.title, duration: w.duration, distance: +w.distance,
      zone: w.zone, desc: w.description, notes: w.notes, order: w.sort, steps: w.steps, result: res[w.id] || null,
    })),
  });
  return {
    owned: athletes.filter(a => a.owner_id === uid).map(toAthlete),
    linked: athletes.filter(a => a.owner_id !== uid && a.athlete_user_id === uid).map(toAthlete),
    library: lib && Array.isArray(lib.items) ? lib.items.map(t => sanitizeTemplate(t)) : null,
  };
}

/* ---------- Envio (só o que mudou) ---------- */
function cloudSchedule() {
  if (Cloud.mode !== 'coach') return;
  clearTimeout(Cloud.timer);
  setSyncStatus('saving');
  Cloud.timer = setTimeout(() => { Cloud.timer = null; cloudPush(); }, 600);
}

const chunks = (arr, n) => { const out = []; for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n)); return out; };
async function ok(p) { const { error } = await p; if (error) throw error; }

async function cloudPush() {
  if (Cloud.mode !== 'coach') return;
  if (Cloud.busy) { Cloud.dirty = true; return; }
  Cloud.busy = true;
  clearTimeout(Cloud.retry);
  setSyncStatus('saving');
  const c = Cloud.client;
  const cur = snapshot(), old = Cloud.synced;
  try {
    const parse = s => JSON.parse(s);
    const newA = [], updA = [], delA = [];
    Object.keys(cur.athletes).forEach(id => {
      if (!(id in old.athletes)) newA.push({ id, ...parse(cur.athletes[id]) });
      else if (cur.athletes[id] !== old.athletes[id]) updA.push({ id, ...parse(cur.athletes[id]) });
    });
    Object.keys(old.athletes).forEach(id => { if (!(id in cur.athletes)) delA.push(id); });

    const upW = Object.keys(cur.workouts).filter(id => cur.workouts[id] !== old.workouts[id]).map(id => parse(cur.workouts[id]));
    const delW = Object.keys(old.workouts).filter(id => !(id in cur.workouts));
    const upR = Object.keys(cur.results).filter(id => cur.results[id] !== old.results[id]).map(id => parse(cur.results[id]));
    const delR = Object.keys(old.results).filter(id => !(id in cur.results) && id in cur.workouts);

    // ordem: atletas → treinos → resultados → exclusões (de baixo para cima) → biblioteca
    if (newA.length) await ok(c.from('athletes').upsert(newA, { onConflict: 'id', ignoreDuplicates: true }));
    for (const a of updA) await ok(c.from('athletes').update({ name: a.name, zones: a.zones, plan: a.plan, sort: a.sort }).eq('id', a.id));
    for (const part of chunks(upW, 500)) await ok(c.from('workouts').upsert(part));
    for (const part of chunks(upR, 500)) await ok(c.from('results').upsert(part));
    for (const part of chunks(delR, 200)) await ok(c.from('results').delete().in('workout_id', part));
    for (const part of chunks(delW, 200)) await ok(c.from('workouts').delete().in('id', part));
    for (const part of chunks(delA, 200)) await ok(c.from('athletes').delete().in('id', part));
    if (cur.library !== old.library) {
      await ok(c.from('libraries').upsert({ owner_id: Cloud.user.id, items: JSON.parse(cur.library) }));
    }
    Cloud.synced = cur;
    setSyncStatus('ok');
  } catch (e) {
    console.error(e);
    setSyncStatus(navigator.onLine === false ? 'offline' : 'error', e.message || String(e));
    Cloud.retry = setTimeout(cloudPush, 15000);
  } finally {
    Cloud.busy = false;
    if (Cloud.dirty) { Cloud.dirty = false; cloudPush(); }
  }
}
const hasPendingChanges = () => Cloud.busy || Cloud.dirty || Cloud.timer !== null;

/* ---------- Início da sessão ---------- */
async function cloudStart(user) {
  Cloud.user = user;
  setSyncStatus('loading');
  $('#calendar').innerHTML = '<p class="muted loading">Carregando seus treinos…</p>';

  const code = pendingInvite();
  if (code) {
    const { data, error } = await Cloud.client.rpc('claim_invite', { code });
    lsDel(INVITE_KEY);
    if (error) toast('Não foi possível usar o convite');
    else if (data && data.length) toast(`Convite aceito: plano de ${data[0].name}`);
    else toast('Este convite já foi usado ou não existe mais. Peça um novo a quem monta seus treinos.');
  }

  let data;
  try { data = await cloudFetch(); }
  catch (e) {
    console.error(e);
    setSyncStatus('error', e.message);
    $('#calendar').innerHTML = '';
    toast('Não foi possível carregar os dados da nuvem');
    return;
  }

  const ui = loadUI();
  if (data.owned.length || !data.linked.length) {
    // ---- treinador ----
    Cloud.mode = 'coach';
    document.body.classList.add('cloud', 'cloud-coach');
    const emptyCloud = !data.owned.length;
    db = {
      athletes: data.owned,
      currentId: ui.currentId,
      library: data.library || defaultLibrary(),
      libraryOpen: !!ui.libraryOpen,
    };
    Cloud.synced = emptyCloud ? { athletes: {}, workouts: {}, results: {}, library: null } : snapshot();
    if (!data.library) Cloud.synced.library = null; // biblioteca ainda não está na nuvem
    upgradeLibrary(db.library); // se mudar algo, vai para a nuvem no próximo envio
    if (emptyCloud) await firstCoachSetup();
    if (!db.athletes.some(a => a.id === db.currentId)) db.currentId = db.athletes[0].id;
    render();
    cloudPush();
  } else {
    // ---- atleta ----
    Cloud.mode = 'athlete';
    readOnly = true;
    document.body.classList.add('readonly', 'cloud', 'cloud-athlete');
    $('#readonlyBanner').hidden = false;
    db = { athletes: data.linked, currentId: ui.currentId };
    if (!db.athletes.some(a => a.id === db.currentId)) db.currentId = db.athletes[0].id;
    Cloud.synced = snapshot();
    renderRoSelect();
    render();
    setSyncStatus('ok');
  }
  renderAccount();
  startRefreshLoop();
}

// Primeiro acesso do treinador: leva os dados deste navegador para a conta (ou começa do zero)
async function firstCoachSetup() {
  const local = loadDB();
  const count = local.athletes.reduce((s, a) => s + a.workouts.length, 0);
  let useLocal = false;
  if (count) {
    useLocal = await ask({
      title: 'Levar seus treinos para a conta?',
      text: `Este navegador tem ${local.athletes.length} atleta(s) e ${count} treino(s). Quer enviá-los para a sua conta na nuvem? Os dados daqui não são apagados.`,
      ok: 'Enviar para a nuvem',
    });
  }
  if (useLocal) {
    // ids novos, para não colidir com dados de outras contas
    db.athletes = local.athletes.map(a => ({
      ...a, id: uid(), inviteCode: null, linked: false, zones: sanitizeZones(a.zones),
      workouts: a.workouts.map(w => sanitizeWorkout({ ...w, id: uid() })),
    }));
    db.library = (local.library || defaultLibrary()).map(t => sanitizeTemplate({ ...t, id: uid() }));
    toast('Enviando seus treinos para a nuvem…');
  } else {
    db.athletes = [{ ...newAthlete('Minha atleta'), zones: sanitizeZones({}), inviteCode: null, linked: false }];
  }
  db.currentId = db.athletes[0].id;
}

/* ---------- Atualização automática (ver o que a outra pessoa mudou) ---------- */
async function cloudRefresh() {
  if (Cloud.mode === 'local' || Cloud.refreshing || hasPendingChanges()) return;
  if ($$('dialog[open]').length) return; // não mexe enquanto um formulário está aberto
  Cloud.refreshing = true;
  try {
    const data = await cloudFetch();
    if (hasPendingChanges() || $$('dialog[open]').length) return;
    const list = Cloud.mode === 'coach' ? data.owned : data.linked;
    if (!list.length) return;
    db.athletes = list;
    if (Cloud.mode === 'coach' && data.library) db.library = data.library;
    if (!db.athletes.some(a => a.id === db.currentId)) db.currentId = db.athletes[0].id;
    Cloud.synced = snapshot();
    if (Cloud.mode === 'coach' && !data.library) Cloud.synced.library = null;
    if (Cloud.mode === 'athlete') renderRoSelect();
    render();
  } catch (e) {
    console.warn('Atualização automática falhou', e);
  } finally {
    Cloud.refreshing = false;
  }
}
function startRefreshLoop() {
  window.addEventListener('focus', cloudRefresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) cloudRefresh(); });
  setInterval(() => { if (!document.hidden) cloudRefresh(); }, 60000);
}

/* ---------- Atleta: registrar "como foi" ---------- */
async function cloudSaveResult(w, r) {
  const c = Cloud.client;
  const { error } = r
    ? await c.from('results').upsert({ workout_id: w.id, done: r.done, duration: r.duration, distance: r.distance, rpe: r.rpe, comment: r.comment })
    : await c.from('results').delete().eq('workout_id', w.id);
  if (error) { console.error(error); toast('Não foi possível salvar. Verifique a internet.'); return false; }
  return true;
}

function renderRoSelect() {
  const sel = $('#roSelect');
  if (!sel) return;
  sel.innerHTML = '';
  db.athletes.forEach(a => { const o = el('option', null, a.name); o.value = a.id; o.selected = a.id === db.currentId; sel.append(o); });
  sel.hidden = db.athletes.length < 2;
  $('#roName').hidden = db.athletes.length > 1;
}

/* ---------- Treinador: convite ---------- */
async function openInvite() {
  const a = athlete();
  const extra = $('#shareExtra');
  extra.innerHTML = '';
  const snapshotBtn = el('button', 'btn ghost small', 'Link sem login (cópia do plano)');
  snapshotBtn.type = 'button';
  snapshotBtn.onclick = () => openSnapshotLink();

  if (a.linked) {
    const unlink = el('button', 'btn danger-ghost small', 'Desvincular conta');
    unlink.type = 'button';
    unlink.onclick = async () => {
      const yes = await ask({
        title: `Desvincular a conta de ${a.name}?`,
        text: 'Ela deixa de ver o plano. Os treinos continuam com você, e dá para gerar um convite novo depois.',
        ok: 'Desvincular', danger: true,
      });
      if (!yes) return;
      const { error } = await Cloud.client.rpc('unlink_athlete', { a: a.id });
      if (error) { toast('Não foi possível desvincular'); return; }
      a.linked = false;
      $('#shareDialog').close();
      toast('Conta desvinculada');
    };
    extra.append(unlink, snapshotBtn);
    openLinkDialog(
      `${a.name} já tem acesso`,
      'Ela entra no site com a conta dela e vê o plano sempre atualizado, e o que ela marcar como feito aparece aqui para você. Mande o endereço do site, se ela precisar:',
      PAGE_URL(),
      `Seus treinos: ${PAGE_URL()}`,
    );
    return;
  }

  if (!a.inviteCode) {
    const code = newInviteCode();
    const { error } = await Cloud.client.from('athletes').update({ invite_code: code }).eq('id', a.id);
    if (error) {
      // a atleta pode ainda não ter chegado na nuvem
      await cloudPush();
      const again = await Cloud.client.from('athletes').update({ invite_code: code }).eq('id', a.id);
      if (again.error) { toast('Não foi possível criar o convite. Tente de novo.'); return; }
    }
    a.inviteCode = code;
  }
  extra.append(snapshotBtn);
  const url = `${PAGE_URL()}?convite=${a.inviteCode}`;
  openLinkDialog(
    `Convidar ${a.name}`,
    'Ela abre este link, cria a conta dela com email e senha e passa a ver o plano sempre atualizado, podendo marcar os treinos feitos. O convite vale uma vez só.',
    url,
    `Te convidei para ver seu plano de treino. Abra o link e crie sua conta: ${url}`,
  );
}

/* ---------- Conta ---------- */
function renderAccount() {
  const box = $('#account');
  if (!box) return;
  box.hidden = !cloudEnabled();
  if (!cloudEnabled()) return;
  const logged = !!Cloud.user;
  $('#btnLogin').hidden = logged;
  $('#accountMenu').hidden = !logged;
  if (logged) {
    $('#accountEmail').textContent = Cloud.user.email || '';
    $('#accountRole').textContent = Cloud.mode === 'athlete' ? 'Atleta' : 'Treinador';
  }
}

let authMode = 'login';
function openAuth(mode) {
  authMode = mode || (pendingInvite() ? 'signup' : 'login');
  renderAuth();
  $('#authMsg').textContent = '';
  $('#authDialog').showModal();
  $('#authEmail').focus();
}
function renderAuth() {
  const signup = authMode === 'signup';
  $('#authTitle').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#authInvite').hidden = !pendingInvite();
  $('#btnAuthSubmit').textContent = signup ? 'Criar conta' : 'Entrar';
  $('#authSwitch').textContent = signup ? 'Já tenho conta — entrar' : 'Não tenho conta — criar';
  $('#btnForgot').hidden = signup;
  $('#authPass').autocomplete = signup ? 'new-password' : 'current-password';
  $('#authPassHint').hidden = !signup;
}

async function submitAuth(e) {
  e.preventDefault();
  const email = $('#authEmail').value.trim();
  const password = $('#authPass').value;
  const msg = $('#authMsg');
  if (!email || !password) { msg.textContent = 'Preencha email e senha.'; return; }
  if (authMode === 'signup' && password.length < 8) { msg.textContent = 'Use uma senha com pelo menos 8 caracteres.'; return; }
  const btn = $('#btnAuthSubmit');
  btn.disabled = true;
  msg.textContent = '';
  try {
    if (authMode === 'signup') {
      const code = pendingInvite();
      const redirect = code ? `${PAGE_URL()}?convite=${code}` : PAGE_URL();
      const { data, error } = await Cloud.client.auth.signUp({ email, password, options: { emailRedirectTo: redirect } });
      if (error) throw error;
      if (!data.session) {
        msg.textContent = `Enviamos um email de confirmação para ${email}. Abra o link do email para ativar a conta e depois entre aqui.`;
        authMode = 'login';
        renderAuth();
        return;
      }
      $('#authDialog').close();
      await cloudStart(data.user);
    } else {
      const { data, error } = await Cloud.client.auth.signInWithPassword({ email, password });
      if (error) throw error;
      $('#authDialog').close();
      await cloudStart(data.user);
    }
    lsDel(LOCAL_CHOICE_KEY);
  } catch (err) {
    const m = String(err.message || err);
    msg.textContent = /invalid login/i.test(m) ? 'Email ou senha incorretos.'
      : /not confirmed/i.test(m) ? 'Confirme seu email primeiro (veja a caixa de entrada e o spam).'
      : /already registered|already exists/i.test(m) ? 'Esse email já tem conta. Use "entrar".'
      : /rate limit/i.test(m) ? 'Muitas tentativas. Espere alguns minutos.'
      : `Não foi possível: ${m}`;
  } finally {
    btn.disabled = false;
  }
}

async function forgotPassword() {
  const email = $('#authEmail').value.trim();
  if (!email) { $('#authMsg').textContent = 'Digite seu email acima e clique de novo em "Esqueci a senha".'; return; }
  const { error } = await Cloud.client.auth.resetPasswordForEmail(email, { redirectTo: PAGE_URL() });
  $('#authMsg').textContent = error ? 'Não foi possível enviar agora. Tente mais tarde.' : `Se existir conta para ${email}, enviamos um link para criar uma senha nova.`;
}

function bindCloudEvents() {
  if (!cloudEnabled()) return;
  $('#authForm').addEventListener('submit', submitAuth);
  $('#authSwitch').onclick = () => { authMode = authMode === 'signup' ? 'login' : 'signup'; renderAuth(); $('#authMsg').textContent = ''; };
  $('#btnForgot').onclick = forgotPassword;
  $('#btnLocal').onclick = () => {
    lsSet(LOCAL_CHOICE_KEY, '1');
    lsDel(INVITE_KEY);
    $('#authDialog').close();
    renderAccount();
  };
  $('#btnLogin').onclick = () => openAuth('login');
  $('#btnLogout').onclick = async () => {
    if (Cloud.mode === 'coach' && hasPendingChanges()) await cloudPush();
    await Cloud.client.auth.signOut();
    location.href = PAGE_URL();
  };
  $('#roSelect').onchange = e => { db.currentId = e.target.value; saveUI(); render(); };
  Cloud.client.auth.onAuthStateChange(async event => {
    if (event === 'PASSWORD_RECOVERY') {
      const pass = await ask({ title: 'Nova senha', text: 'Digite a nova senha (mínimo 8 caracteres).', input: '', inputType: 'password', ok: 'Salvar senha' });
      if (!pass) return;
      if (pass.length < 8) { toast('A senha precisa ter pelo menos 8 caracteres'); return; }
      const { error } = await Cloud.client.auth.updateUser({ password: pass });
      toast(error ? 'Não foi possível trocar a senha' : 'Senha alterada');
    }
  });
  window.addEventListener('beforeunload', e => {
    if (Cloud.mode === 'coach' && hasPendingChanges()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
}

/* ---------- Ponto de entrada (chamado por init em app.js) ---------- */
async function cloudBoot() {
  if (!cloudEnabled()) return false;
  Cloud.client = window.supabase.createClient(CLOUD_CONFIG.url, CLOUD_CONFIG.anonKey, {
    // implicit: o link de confirmação do email funciona mesmo aberto em outro navegador/app
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'implicit' },
  });
  captureInvite();
  bindCloudEvents();
  renderAccount();
  const { data } = await Cloud.client.auth.getSession();
  const session = data && data.session;
  if (session) {
    await cloudStart(session.user);
    return true;
  }
  if (pendingInvite() || !lsGet(LOCAL_CHOICE_KEY)) {
    db = loadDB();
    render();
    openAuth();
    return true;
  }
  return false; // escolheu usar sem conta
}
