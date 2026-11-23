'use strict';

/* ================= Constantes ================= */
const SPORTS = {
  run: {
    label: 'Corrida', color: '#f2711c', unit: 'km', step: 0.1,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="15" cy="4.5" r="2"/><path d="M6.5 12.5l3-3.5 4 .8 2.5 3 3 .7"/><path d="M13.5 9.8L11 15l3.2 2.2V21"/><path d="M11 15l-2.5 3.5L5 19"/></svg>',
  },
  bike: {
    label: 'Ciclismo', color: '#1f9d55', unit: 'km', step: 0.1,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="5.5" cy="16.5" r="3.5"/><circle cx="18.5" cy="16.5" r="3.5"/><path d="M5.5 16.5L9 10h6.5l3 6.5"/><path d="M9 10l3.5 6.5h-7"/><path d="M14 6.5h2.5"/></svg>',
  },
  swim: {
    label: 'Natação', color: '#1a8fd6', unit: 'm', step: 50,
    icon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="17" cy="7" r="2"/><path d="M4 12.5l4.5-3.5 3 2.2 3-1.7"/><path d="M2 17c1.7 0 1.7-1.3 3.3-1.3S7 17 8.7 17s1.7-1.3 3.3-1.3 1.7 1.3 3.3 1.3 1.7-1.3 3.4-1.3S20.3 17 22 17"/></svg>',
  },
};
const SPORT_KEYS = Object.keys(SPORTS);
const ZONES = [
  ['', 'Sem zona'],
  ['Z1', 'Z1 · Recuperação'],
  ['Z2', 'Z2 · Leve / aeróbico'],
  ['Z3', 'Z3 · Moderado'],
  ['Z4', 'Z4 · Limiar'],
  ['Z5', 'Z5 · Forte / VO2'],
];
const WD = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const WD_LONG = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MON_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const STORE_KEY = 'calendario-treinos:v1';
const SHARE_PREFIX = '#plano=';

/* ================= Utilidades ================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseISO = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); x.setDate(x.getDate() + n); return x; };
const wdIndex = d => (d.getDay() + 6) % 7; // 0 = segunda
const startOfWeek = d => addDays(d, -wdIndex(d));
const endOfWeek = d => addDays(startOfWeek(d), 6);
const startOfMonth = d => new Date(d.getFullYear(), d.getMonth(), 1);
const endOfMonth = d => new Date(d.getFullYear(), d.getMonth() + 1, 0);
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const fmtDM = d => `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
const fmtDMY = d => `${fmtDM(d)}/${d.getFullYear()}`;
const slug = s => (s || 'atleta').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined && text !== null) e.textContent = text;
  return e;
}
function icon(sport) {
  const s = el('span', 'wk-ico');
  s.style.background = SPORTS[sport].color;
  s.innerHTML = SPORTS[sport].icon;
  return s;
}

function parseDuration(str) {
  str = (str || '').trim().toLowerCase();
  if (!str) return 0;
  if (/^\d+$/.test(str)) return +str;
  let m = str.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  m = str.match(/^(\d+)\s*h\s*(\d+)?\s*(min|m)?$/);
  if (m) return +m[1] * 60 + (+m[2] || 0);
  m = str.match(/^(\d+)\s*(min|m)$/);
  if (m) return +m[1];
  return NaN;
}
function fmtDuration(min) {
  if (!min) return '';
  const h = Math.floor(min / 60), m = min % 60;
  return h ? `${h}h${m ? pad(m) : ''}` : `${m}min`;
}
const durInput = min => (min ? `${Math.floor(min / 60)}:${pad(min % 60)}` : '');
function fmtDistance(sport, v) {
  if (!v) return '';
  if (SPORTS[sport].unit === 'm') return `${Math.round(v).toLocaleString('pt-BR')} m`;
  return `${(+v).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
}

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ================= Dados ================= */
let db;
let readOnly = false;
let viewDate = startOfMonth(new Date());
let weekClipboard = null;

const DEFAULT_LIBRARY = [
  ['run', 'Regenerativo', 30, 5, 'Z1', '30 min bem leve, ritmo de conversa fácil', ''],
  ['run', 'Rodagem leve', 45, 7, 'Z2', '45 min contínuo em ritmo confortável', ''],
  ['run', 'Fartlek', 45, 8, 'Z3', 'Aquecimento: 10 min leve\nPrincipal: 8 x (1 min forte / 2 min leve)\nDesaquecimento: 10 min leve', ''],
  ['run', 'Tiros 400 m', 50, 8, 'Z5', 'Aquecimento: 15 min leve\nPrincipal: 8 x 400 m forte / 200 m trote\nDesaquecimento: 10 min leve', 'De preferência em pista ou plano'],
  ['run', 'Longão', 90, 15, 'Z2', 'Contínuo em ritmo confortável', 'Hidratar a cada 20 min'],
  ['bike', 'Pedal leve', 60, 25, 'Z2', 'Pedal contínuo, cadência 85–95 rpm', ''],
  ['bike', 'Intervalado 4 x 6 min', 60, 25, 'Z4', 'Aquecimento: 15 min\nPrincipal: 4 x 6 min forte / 3 min leve\nDesaquecimento: 10 min', ''],
  ['bike', 'Cadência', 50, 20, 'Z2', 'Aquecimento: 10 min\nPrincipal: 6 x 3 min cadência alta (100+ rpm) / 2 min normal\nDesaquecimento: 10 min', ''],
  ['bike', 'Longão', 180, 70, 'Z2', 'Pedal contínuo em ritmo confortável', 'Levar 2 caramanholas e alimentação'],
  ['swim', 'Técnica', 45, 1500, 'Z2', 'Aquecimento: 300 m livre\nPrincipal: 8 x 100 m educativos / 20s\nDesaquecimento: 200 m solto', 'Foco na respiração bilateral'],
  ['swim', 'Contínuo', 40, 1800, 'Z2', '1.800 m contínuos em ritmo confortável', ''],
  ['swim', 'Séries 10 x 100 m', 50, 2000, 'Z3', 'Aquecimento: 400 m\nPrincipal: 10 x 100 m moderado / 20s\nDesaquecimento: 200 m solto', ''],
];
function defaultLibrary() {
  return DEFAULT_LIBRARY.map(([sport, title, duration, distance, zone, desc, notes], i) =>
    ({ id: uid(), sport, title, duration, distance, zone, desc, notes, order: i }));
}
function sanitizeTemplate(t) {
  const w = sanitizeWorkout({ ...t, date: '2000-01-01' });
  delete w.date;
  return w;
}

function newAthlete(name) { return { id: uid(), name, workouts: [] }; }
function loadDB() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.athletes) && d.athletes.length) {
        if (!Array.isArray(d.library)) d.library = defaultLibrary();
        return d;
      }
    }
  } catch (e) { /* sem armazenamento */ }
  const a = newAthlete('Minha atleta');
  return { athletes: [a], currentId: a.id, library: defaultLibrary() };
}
function saveDB() {
  if (readOnly) return;
  try { localStorage.setItem(STORE_KEY, JSON.stringify(db)); }
  catch (e) { toast('Não foi possível salvar neste navegador'); }
}
const athlete = () => db.athletes.find(a => a.id === db.currentId) || db.athletes[0];

function sanitizeWorkout(w) {
  const sport = SPORT_KEYS.includes(w.sport) ? w.sport : 'run';
  return {
    id: w.id || uid(),
    date: /^\d{4}-\d{2}-\d{2}$/.test(w.date) ? w.date : iso(new Date()),
    sport,
    title: String(w.title || '').slice(0, 80),
    duration: Math.max(0, Math.round(+w.duration || 0)),
    distance: Math.max(0, +w.distance || 0),
    zone: ZONES.some(z => z[0] === w.zone) ? w.zone : '',
    desc: String(w.desc || ''),
    notes: String(w.notes || ''),
    order: +w.order || 0,
  };
}
function groupByDate(list) {
  const g = {};
  list.forEach(w => (g[w.date] = g[w.date] || []).push(w));
  Object.values(g).forEach(arr => arr.sort((a, b) => a.order - b.order));
  return g;
}
const nextOrder = date => Math.max(0, ...athlete().workouts.filter(w => w.date === date).map(w => w.order)) + 1;

/* ================= Link compartilhável ================= */
function b64url(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(str) {
  str = str.replace(/-/g, '+').replace(/_/g, '/');
  while (str.length % 4) str += '=';
  const bin = atob(str), out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
async function encodePlan(a) {
  const compact = { n: a.name, w: a.workouts.map(w => [w.date, w.sport, w.title, w.duration, w.distance, w.zone, w.desc, w.notes, w.order]) };
  const bytes = new TextEncoder().encode(JSON.stringify(compact));
  if ('CompressionStream' in window) {
    const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'));
    return 'z' + b64url(new Uint8Array(await new Response(stream).arrayBuffer()));
  }
  return 'j' + b64url(bytes);
}
async function decodePlan(str) {
  const kind = str[0], bytes = unb64url(str.slice(1));
  let text;
  if (kind === 'z') {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    text = await new Response(stream).text();
  } else text = new TextDecoder().decode(bytes);
  const c = JSON.parse(text);
  return {
    id: 'compartilhado',
    name: String(c.n || 'Atleta'),
    workouts: (c.w || []).map(r => sanitizeWorkout({ date: r[0], sport: r[1], title: r[2], duration: r[3], distance: r[4], zone: r[5], desc: r[6], notes: r[7], order: r[8] })),
  };
}

/* ================= Render ================= */
function renderLegend(target) {
  target.innerHTML = '';
  SPORT_KEYS.forEach(k => {
    const s = el('span');
    const sw = icon(k); sw.className = 'sw';
    s.append(sw, SPORTS[k].label);
    target.append(s);
  });
}

function renderHeader() {
  const sel = $('#athleteSelect');
  sel.innerHTML = '';
  db.athletes.forEach(a => {
    const o = el('option', null, a.name);
    o.value = a.id;
    o.selected = a.id === athlete().id;
    sel.append(o);
  });
  $('#monthTitle').textContent = `${MONTHS[viewDate.getMonth()]} ${viewDate.getFullYear()}`;
  if (readOnly) $('#roName').textContent = athlete().name;
  document.title = readOnly ? `Treinos · ${athlete().name}` : 'Calendário de Treinos';
}

function workoutCard(w, opts = {}) {
  const c = el('div', 'wk');
  c.style.setProperty('--sport', SPORTS[w.sport].color);
  c.dataset.id = w.id;
  c.tabIndex = 0;
  const head = el('div', 'wk-head');
  head.append(icon(w.sport), el('span', 'wk-title', w.title || SPORTS[w.sport].label));
  c.append(head);
  const meta = el('div', 'wk-meta');
  if (w.duration) meta.append(el('b', null, fmtDuration(w.duration)));
  if (w.distance) meta.append(el('span', null, fmtDistance(w.sport, w.distance)));
  if (w.zone) meta.append(el('span', `zone ${w.zone}`, w.zone));
  if (meta.childNodes.length) c.append(meta);
  if (w.desc) c.append(el('div', 'wk-desc', w.desc));

  const open = opts.template ? () => openWorkout(null, defaultUseDate(), w) : () => openWorkout(w.id);
  c.addEventListener('click', open);
  c.addEventListener('keydown', e => { if (e.key === 'Enter') open(); });
  if (!readOnly) {
    c.draggable = true;
    c.addEventListener('dragstart', e => {
      e.dataTransfer.setData('text/plain', opts.template ? `tpl:${w.id}` : w.id);
      e.dataTransfer.effectAllowed = opts.template ? 'copy' : 'copyMove';
      c.classList.add('dragging');
    });
    c.addEventListener('dragend', () => c.classList.remove('dragging'));
  }
  return c;
}

function totals(list) {
  const t = { duration: 0, count: list.length, sports: {} };
  list.forEach(w => {
    t.duration += w.duration;
    const s = t.sports[w.sport] || (t.sports[w.sport] = { duration: 0, distance: 0, count: 0 });
    s.duration += w.duration; s.distance += w.distance; s.count++;
  });
  return t;
}
function sportSummaryText(sport, s) {
  return [fmtDuration(s.duration), fmtDistance(sport, s.distance)].filter(Boolean).join(' · ') || `${s.count} treino${s.count > 1 ? 's' : ''}`;
}

function weekSummary(weekStart, list) {
  const box = el('div', 'cal-sum');
  const t = totals(list);
  box.append(el('div', 'sum-title', 'Semana'));
  if (!t.count) box.append(el('div', 'sum-empty', 'Sem treinos'));
  else {
    box.append(el('div', 'sum-total', fmtDuration(t.duration) || `${t.count} treinos`));
    SPORT_KEYS.forEach(k => {
      const s = t.sports[k];
      if (!s) return;
      const r = el('div', 'sum-row');
      r.append(icon(k), el('span', null, SPORTS[k].label), el('span', null, sportSummaryText(k, s)));
      box.append(r);
    });
  }
  if (!readOnly) {
    const act = el('div', 'sum-actions');
    if (t.count) {
      const cp = el('button', null, 'Copiar semana');
      cp.type = 'button';
      cp.onclick = () => {
        weekClipboard = list.map(w => ({ ...w, offset: Math.round((parseISO(w.date) - weekStart) / 864e5) }));
        toast(`Semana copiada (${list.length} treino${list.length > 1 ? 's' : ''}). Use "Colar" em outra semana.`);
        renderCalendar();
      };
      act.append(cp);
    }
    if (weekClipboard) {
      const ps = el('button', null, 'Colar');
      ps.type = 'button';
      ps.onclick = () => {
        weekClipboard.forEach(w => {
          const date = iso(addDays(weekStart, w.offset));
          athlete().workouts.push(sanitizeWorkout({ ...w, id: uid(), date, order: nextOrder(date) }));
        });
        saveDB(); renderCalendar();
        toast('Semana colada');
      };
      act.append(ps);
    }
    if (act.childNodes.length) box.append(act);
  }
  return box;
}

function renderCalendar() {
  const cal = $('#calendar');
  cal.innerHTML = '';
  const byDate = groupByDate(athlete().workouts);
  const first = startOfMonth(viewDate), last = endOfMonth(viewDate);
  const todayKey = iso(new Date());

  const head = el('div', 'cal-head');
  WD_LONG.forEach(w => head.append(el('div', 'cal-hcell', w)));
  head.append(el('div', 'cal-hcell', 'Resumo'));
  cal.append(head);

  for (let ws = startOfWeek(first); ws <= last; ws = addDays(ws, 7)) {
    const week = el('div', 'cal-week');
    const weekList = [];
    for (let i = 0; i < 7; i++) {
      const day = addDays(ws, i), key = iso(day);
      const items = byDate[key] || [];
      weekList.push(...items);
      const cell = el('div', 'cal-day');
      cell.dataset.date = key;
      if (day.getMonth() !== viewDate.getMonth()) cell.classList.add('other-month');
      if (key === todayKey) cell.classList.add('today');
      if (!items.length) cell.classList.add('empty');

      const top = el('div', 'day-top');
      top.append(el('span', 'day-wd', WD[i]));
      top.append(el('span', 'day-num', day.getDate() === 1 ? `1 ${MON_SHORT[day.getMonth()]}` : String(day.getDate())));
      if (!readOnly) {
        const add = el('button', 'day-add', '+');
        add.type = 'button';
        add.title = 'Adicionar treino';
        add.onclick = e => { e.stopPropagation(); openWorkout(null, key); };
        top.append(add);
      }
      cell.append(top);
      items.forEach(w => cell.append(workoutCard(w)));

      if (!readOnly) {
        cell.addEventListener('dragover', e => {
          e.preventDefault();
          e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' || e.ctrlKey || e.altKey ? 'copy' : 'move';
          cell.classList.add('drop');
        });
        cell.addEventListener('dragleave', e => { if (!cell.contains(e.relatedTarget)) cell.classList.remove('drop'); });
        cell.addEventListener('drop', e => {
          e.preventDefault();
          cell.classList.remove('drop');
          const data = e.dataTransfer.getData('text/plain');
          if (data.startsWith('tpl:')) addFromTemplate(data.slice(4), key);
          else moveWorkout(data, key, e.ctrlKey || e.altKey);
        });
        cell.addEventListener('dblclick', e => {
          if (e.target === cell || e.target.classList.contains('day-top')) openWorkout(null, key);
        });
      }
      week.append(cell);
    }
    week.append(weekSummary(ws, weekList));
    cal.append(week);
  }
}

function render() { renderHeader(); renderCalendar(); renderLibrary(); }

/* ================= Biblioteca ================= */
let libFilter = 'all';

function renderLibrary() {
  if (readOnly) return;
  const lib = $('#library');
  const open = !!db.libraryOpen;
  lib.hidden = !open;
  $('#btnLibrary').setAttribute('aria-pressed', String(open));
  if (!open) return;

  $$('#libFilters .chip').forEach(c => c.setAttribute('aria-pressed', String(c.dataset.filter === libFilter)));
  const q = $('#libSearch').value.trim().toLowerCase();
  const items = db.library
    .filter(t => libFilter === 'all' || t.sport === libFilter)
    .filter(t => !q || `${t.title} ${t.desc} ${SPORTS[t.sport].label}`.toLowerCase().includes(q))
    .sort((a, b) => SPORT_KEYS.indexOf(a.sport) - SPORT_KEYS.indexOf(b.sport) || a.order - b.order);

  const list = $('#libList');
  list.innerHTML = '';
  if (!items.length) list.append(el('div', 'lib-empty', db.library.length ? 'Nenhum modelo encontrado' : 'Biblioteca vazia'));
  items.forEach(t => {
    const c = workoutCard({ ...t, id: t.id }, { template: true });
    const ed = el('button', 'lib-edit', '✎');
    ed.type = 'button';
    ed.title = 'Editar modelo';
    ed.onclick = e => { e.stopPropagation(); openTemplate(t.id); };
    c.append(ed);
    list.append(c);
  });
}

function addFromTemplate(tplId, date) {
  const t = db.library.find(x => x.id === tplId);
  if (!t) return;
  athlete().workouts.push(sanitizeWorkout({ ...t, id: uid(), date, order: nextOrder(date) }));
  saveDB(); renderCalendar();
  toast(`"${t.title || SPORTS[t.sport].label}" adicionado em ${fmtDM(parseISO(date))}`);
}

function defaultUseDate() {
  const today = new Date();
  const inView = today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
  return iso(inView ? today : startOfMonth(viewDate));
}

function setLibraryOpen(open) {
  db.libraryOpen = open;
  saveDB();
  renderLibrary();
}

function moveWorkout(id, date, copy) {
  const w = athlete().workouts.find(x => x.id === id);
  if (!w) return;
  if (copy) {
    athlete().workouts.push({ ...w, id: uid(), date, order: nextOrder(date) });
    toast('Treino copiado');
  } else {
    if (w.date === date) return;
    w.order = nextOrder(date);
    w.date = date;
  }
  saveDB(); renderCalendar();
}

/* ================= Diálogo de treino ================= */
let editingId = null;
let currentSport = 'run';

function setSport(k) {
  currentSport = k;
  $$('#sportPick button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.sport === k)));
  $('#wDistUnit').textContent = SPORTS[k].unit;
  $('#wDistance').step = SPORTS[k].step;
}

let dialogMode = 'workout'; // 'workout' | 'template'

function fillForm(src, date) {
  setSport(src ? src.sport : currentSport);
  $('#wDate').value = date || '';
  $('#wTitle').value = src ? src.title : '';
  $('#wDuration').value = src ? durInput(src.duration) : '';
  $('#wDistance').value = src && src.distance ? src.distance : '';
  $('#wZone').value = src ? src.zone : '';
  $('#wDesc').value = src ? src.desc : '';
  $('#wNotes').value = src ? src.notes : '';
}

// id: treino existente · date: data para treino novo · prefill: modelo da biblioteca para preencher
function openWorkout(id, date, prefill) {
  dialogMode = 'workout';
  const w = id ? athlete().workouts.find(x => x.id === id) : null;
  editingId = w ? w.id : null;
  $('#wDialogTitle').textContent = readOnly ? 'Treino' : (w ? 'Editar treino' : prefill ? 'Usar modelo da biblioteca' : 'Novo treino');
  fillForm(w || prefill, w ? w.date : date);
  $('#wDateLabel').hidden = false;
  $('#wFields').disabled = readOnly;
  $('#btnDelete').hidden = !w;
  $('#btnDuplicate').hidden = !w;
  $('#btnToLibrary').hidden = false;
  $('#btnSave').textContent = prefill ? 'Adicionar ao calendário' : 'Salvar';
  $('#workoutDialog').showModal();
  if (prefill) $('#wDate').focus();
  else if (!readOnly && !w) $('#wTitle').focus();
}

function openTemplate(id) {
  dialogMode = 'template';
  const t = id ? db.library.find(x => x.id === id) : null;
  editingId = t ? t.id : null;
  $('#wDialogTitle').textContent = t ? 'Editar modelo da biblioteca' : 'Novo modelo da biblioteca';
  fillForm(t, '');
  if (!t && libFilter !== 'all') setSport(libFilter);
  $('#wDateLabel').hidden = true;
  $('#wFields').disabled = false;
  $('#btnDelete').hidden = !t;
  $('#btnDuplicate').hidden = true;
  $('#btnToLibrary').hidden = true;
  $('#btnSave').textContent = 'Salvar modelo';
  $('#workoutDialog').showModal();
  $('#wTitle').focus();
}

function saveTemplateFromForm(existingId) {
  const data = readForm();
  if (!data) return false;
  delete data.date;
  if (!data.title) { toast('Dê um título ao modelo'); $('#wTitle').focus(); return false; }
  if (existingId) {
    const t = db.library.find(x => x.id === existingId);
    Object.assign(t, sanitizeTemplate({ ...t, ...data }));
  } else {
    db.library.push(sanitizeTemplate({ ...data, id: uid(), order: Math.max(0, ...db.library.map(t => t.order)) + 1 }));
  }
  saveDB();
  return true;
}

function readForm() {
  const duration = parseDuration($('#wDuration').value);
  if (Number.isNaN(duration)) {
    toast('Duração inválida. Use 1:30, 90 ou 1h30.');
    $('#wDuration').focus();
    return null;
  }
  return {
    sport: currentSport,
    date: $('#wDate').value,
    title: $('#wTitle').value.trim(),
    duration,
    distance: +$('#wDistance').value || 0,
    zone: $('#wZone').value,
    desc: $('#wDesc').value.trim(),
    notes: $('#wNotes').value.trim(),
  };
}

function saveWorkout(e) {
  e.preventDefault();
  if (readOnly) return;
  if (dialogMode === 'template') {
    if (!saveTemplateFromForm(editingId)) return;
    $('#workoutDialog').close();
    renderLibrary();
    toast('Modelo salvo na biblioteca');
    return;
  }
  const data = readForm();
  if (!data) return;
  if (!data.date) { toast('Informe a data'); return; }
  const list = athlete().workouts;
  if (editingId) {
    const w = list.find(x => x.id === editingId);
    if (w.date !== data.date) data.order = nextOrder(data.date);
    Object.assign(w, sanitizeWorkout({ ...w, ...data }));
  } else {
    list.push(sanitizeWorkout({ ...data, id: uid(), order: nextOrder(data.date) }));
  }
  saveDB();
  $('#workoutDialog').close();
  const d = parseISO(data.date);
  if (d.getMonth() !== viewDate.getMonth() || d.getFullYear() !== viewDate.getFullYear()) {
    const inView = d >= startOfWeek(startOfMonth(viewDate)) && d <= endOfWeek(endOfMonth(viewDate));
    if (!inView) viewDate = startOfMonth(d);
  }
  render();
  toast('Treino salvo');
}

/* ================= Exportar imagem ================= */
let lastBlob = null, lastName = '';

function setExportRange(preset) {
  const today = new Date();
  let from, to;
  const inView = today.getMonth() === viewDate.getMonth() && today.getFullYear() === viewDate.getFullYear();
  const base = inView ? today : startOfMonth(viewDate);
  if (preset === 'week') { from = startOfWeek(base); to = endOfWeek(base); }
  else if (preset === 'next') { from = addDays(startOfWeek(base), 7); to = addDays(from, 6); }
  else { from = startOfMonth(viewDate); to = endOfMonth(viewDate); }
  $('#exFrom').value = iso(from);
  $('#exTo').value = iso(to);
  $('#exLayout').value = preset === 'month' ? 'grid' : 'list';
}

function exportCard(w, withDesc) {
  const c = el('div', 'ex-card');
  c.style.setProperty('--sport', SPORTS[w.sport].color);
  c.style.borderLeftColor = SPORTS[w.sport].color;
  const t = el('div', 't');
  t.append(icon(w.sport), el('span', null, w.title || SPORTS[w.sport].label));
  c.append(t);
  const m = el('div', 'm');
  if (w.title) m.append(el('span', null, SPORTS[w.sport].label));
  if (w.duration) m.append(el('b', null, fmtDuration(w.duration)));
  if (w.distance) m.append(el('span', null, fmtDistance(w.sport, w.distance)));
  if (w.zone) m.append(el('span', `zone ${w.zone}`, ZONES.find(z => z[0] === w.zone)[1]));
  if (m.childNodes.length) c.append(m);
  if (withDesc && w.desc) c.append(el('div', 's', w.desc));
  if (withDesc && w.notes) c.append(el('div', 'n', w.notes));
  return c;
}

function exportSummaryLine(list) {
  const t = totals(list);
  if (!t.count) return 'Sem treinos';
  const parts = [];
  if (t.duration) parts.push(`Total ${fmtDuration(t.duration)}`);
  SPORT_KEYS.forEach(k => { if (t.sports[k]) parts.push(`${SPORTS[k].label} ${sportSummaryText(k, t.sports[k])}`); });
  return parts.join('  ·  ');
}

function buildExport(from, to, layout, withDesc) {
  const a = athlete();
  const byDate = groupByDate(a.workouts);
  const root = el('div', `export ${layout}`);

  const head = el('div', 'ex-head');
  const left = el('div');
  left.append(el('div', 'ex-kicker', 'Plano de treino'), el('div', 'ex-name', a.name));
  head.append(left, el('div', 'ex-period', `${fmtDMY(from)} a ${fmtDMY(to)}`));
  root.append(head);
  const legend = el('div', 'ex-legend');
  renderLegend(legend);
  $$('.sw', legend).forEach(s => (s.className = 'wk-ico'));
  root.append(legend);

  if (layout === 'grid') {
    const gh = el('div', 'ex-gridhead');
    WD_LONG.forEach(w => gh.append(el('div', null, w)));
    gh.append(el('div', null, 'Resumo'));
    root.append(gh);
    let firstWeek = true;
    for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
      const row = el('div', 'ex-week' + (firstWeek ? ' first' : ''));
      firstWeek = false;
      const weekList = [];
      for (let i = 0; i < 7; i++) {
        const day = addDays(ws, i), key = iso(day);
        const inRange = day >= from && day <= to;
        const cell = el('div', 'ex-day' + (inRange ? '' : ' out'));
        cell.append(el('div', 'd', day.getDate() === 1 || i === 0 ? fmtDM(day) : String(day.getDate())));
        if (inRange) (byDate[key] || []).forEach(w => { weekList.push(w); cell.append(exportCard(w, withDesc)); });
        row.append(cell);
      }
      const sum = el('div', 'ex-sum');
      const t = totals(weekList);
      sum.append(el('div', 'sum-title', 'Semana'));
      if (t.count) {
        sum.append(el('div', 'tot', fmtDuration(t.duration) || `${t.count} treinos`));
        SPORT_KEYS.forEach(k => {
          if (!t.sports[k]) return;
          const r = el('div', 'sum-row');
          r.append(icon(k), el('span', null, SPORTS[k].label), el('span', null, sportSummaryText(k, t.sports[k])));
          sum.append(r);
        });
      } else sum.append(el('div', 'sum-empty', 'Sem treinos'));
      row.append(sum);
      root.append(row);
    }
  } else {
    for (let ws = startOfWeek(from); ws <= to; ws = addDays(ws, 7)) {
      const days = [];
      for (let i = 0; i < 7; i++) { const d = addDays(ws, i); if (d >= from && d <= to) days.push(d); }
      const weekList = days.flatMap(d => byDate[iso(d)] || []);
      const title = el('div', 'ex-wk-title');
      title.append(el('span', null, `Semana ${fmtDM(days[0])} – ${fmtDM(days[days.length - 1])}`), el('span', null, exportSummaryLine(weekList)));
      root.append(title);
      days.forEach(d => {
        const row = el('div', 'ex-row');
        const date = el('div', 'ex-date');
        date.append(el('div', 'wd', WD_LONG[wdIndex(d)]), el('div', 'dm', fmtDM(d)));
        const cards = el('div', 'cards');
        const items = byDate[iso(d)] || [];
        if (items.length) items.forEach(w => cards.append(exportCard(w, withDesc)));
        else cards.append(el('div', 'rest', 'Descanso'));
        row.append(date, cards);
        root.append(row);
      });
    }
  }

  const foot = el('div', 'ex-foot');
  foot.append(el('span', null, 'Corrida · Ciclismo · Natação'), el('span', null, `Gerado em ${fmtDMY(new Date())}`));
  root.append(foot);
  return root;
}

async function generateImage() {
  const fromS = $('#exFrom').value, toS = $('#exTo').value;
  if (!fromS || !toS) { toast('Escolha as datas'); return; }
  let from = parseISO(fromS), to = parseISO(toS);
  if (to < from) [from, to] = [to, from];
  if ((to - from) / 864e5 > 92) { toast('Período máximo: 3 meses'); return; }
  if (!window.html2canvas) { toast('A biblioteca de imagem não carregou. Verifique a internet.'); return; }

  const layout = $('#exLayout').value;
  const btn = $('#btnGen');
  btn.disabled = true; btn.textContent = 'Gerando...';
  const holder = el('div', 'export-holder');
  holder.append(buildExport(from, to, layout, $('#exDesc').checked));
  document.body.append(holder);
  try {
    if (document.fonts && document.fonts.ready) await document.fonts.ready;
    const canvas = await html2canvas(holder.firstChild, { scale: 2, backgroundColor: '#ffffff', logging: false, useCORS: true });
    lastBlob = await new Promise(res => canvas.toBlob(res, 'image/png'));
    lastName = `treinos-${slug(athlete().name)}-${iso(from)}-a-${iso(to)}.png`;
    const img = new Image();
    img.alt = 'Prévia da imagem exportada';
    img.src = URL.createObjectURL(lastBlob);
    const pv = $('#exPreview');
    pv.innerHTML = '';
    pv.append(img);
    $('#btnDownload').disabled = false;
    $('#btnShareImg').hidden = !(navigator.canShare && navigator.canShare({ files: [new File([lastBlob], lastName, { type: 'image/png' })] }));
  } catch (err) {
    console.error(err);
    toast('Não foi possível gerar a imagem');
  } finally {
    holder.remove();
    btn.disabled = false; btn.textContent = 'Gerar imagem';
  }
}

function downloadBlob(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/* ================= Backup ================= */
function exportBackup() {
  const blob = new Blob([JSON.stringify(db, null, 2)], { type: 'application/json' });
  downloadBlob(blob, `backup-calendario-treinos-${iso(new Date())}.json`);
}
function importBackup(file) {
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!d || !Array.isArray(d.athletes) || !d.athletes.length) throw new Error('formato');
      if (!confirm('Importar este backup vai substituir todos os dados atuais. Continuar?')) return;
      db = {
        athletes: d.athletes.map(a => ({ id: a.id || uid(), name: String(a.name || 'Atleta'), workouts: (a.workouts || []).map(sanitizeWorkout) })),
        currentId: d.currentId,
        library: Array.isArray(d.library) ? d.library.map(t => sanitizeTemplate({ ...t, id: t.id || uid() })) : db.library,
        libraryOpen: db.libraryOpen,
      };
      saveDB(); render();
      toast('Backup importado');
    } catch (e) { toast('Arquivo inválido'); }
  };
  r.readAsText(file);
}

/* ================= Eventos ================= */
function bindEvents() {
  $('#btnPrev').onclick = () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() - 1, 1); render(); };
  $('#btnNext').onclick = () => { viewDate = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 1); render(); };
  $('#btnToday').onclick = () => { viewDate = startOfMonth(new Date()); render(); };

  $('#athleteSelect').onchange = e => { db.currentId = e.target.value; saveDB(); render(); };

  document.addEventListener('click', e => {
    $$('details.dropdown[open]').forEach(d => { if (!d.contains(e.target)) d.open = false; });
    const act = e.target.closest('[data-act]');
    if (!act) return;
    act.closest('details').open = false;
    const a = athlete();
    switch (act.dataset.act) {
      case 'athlete-new': {
        const name = (prompt('Nome da atleta:') || '').trim();
        if (!name) return;
        const n = newAthlete(name);
        db.athletes.push(n); db.currentId = n.id; saveDB(); render();
        break;
      }
      case 'athlete-rename': {
        const name = (prompt('Novo nome:', a.name) || '').trim();
        if (!name) return;
        a.name = name; saveDB(); render();
        break;
      }
      case 'athlete-delete':
        if (db.athletes.length === 1) { toast('É preciso ter pelo menos uma atleta'); return; }
        if (!confirm(`Excluir "${a.name}" e todos os ${a.workouts.length} treinos? Isso não pode ser desfeito.`)) return;
        db.athletes = db.athletes.filter(x => x.id !== a.id);
        db.currentId = db.athletes[0].id; saveDB(); render();
        break;
      case 'backup': exportBackup(); break;
      case 'import': $('#importFile').click(); break;
    }
  });
  $('#importFile').onchange = e => { if (e.target.files[0]) importBackup(e.target.files[0]); e.target.value = ''; };

  $$('[data-close]').forEach(b => (b.onclick = () => b.closest('dialog').close()));
  $$('dialog').forEach(d => d.addEventListener('click', e => { if (e.target === d) d.close(); }));

  // Treino
  const pick = $('#sportPick');
  SPORT_KEYS.forEach(k => {
    const b = el('button');
    b.type = 'button';
    b.dataset.sport = k;
    b.style.setProperty('--sport', SPORTS[k].color);
    b.append(icon(k), SPORTS[k].label);
    b.onclick = () => setSport(k);
    pick.append(b);
  });
  ZONES.forEach(([v, l]) => { const o = el('option', null, l); o.value = v; $('#wZone').append(o); });
  $('#workoutForm').addEventListener('submit', saveWorkout);
  $('#btnStructure').onclick = () => {
    const t = $('#wDesc');
    const tpl = 'Aquecimento: \nPrincipal: \nDesaquecimento: ';
    t.value = t.value.trim() ? `${t.value.trim()}\n${tpl}` : tpl;
    t.focus();
    t.setSelectionRange(13 + (t.value.length - tpl.length), 13 + (t.value.length - tpl.length));
  };
  $('#btnDelete').onclick = () => {
    if (dialogMode === 'template') {
      const t = db.library.find(x => x.id === editingId);
      if (!t || !confirm(`Excluir o modelo "${t.title}" da biblioteca? Os treinos já colocados no calendário não mudam.`)) return;
      db.library = db.library.filter(x => x.id !== editingId);
      saveDB(); $('#workoutDialog').close(); renderLibrary();
      toast('Modelo excluído');
      return;
    }
    if (!editingId || !confirm('Excluir este treino?')) return;
    athlete().workouts = athlete().workouts.filter(w => w.id !== editingId);
    saveDB(); $('#workoutDialog').close(); renderCalendar();
    toast('Treino excluído');
  };
  $('#btnDuplicate').onclick = () => {
    const data = readForm();
    if (!data) return;
    const date = $('#wDate').value;
    athlete().workouts.push(sanitizeWorkout({ ...data, id: uid(), date, order: nextOrder(date) }));
    saveDB(); $('#workoutDialog').close(); renderCalendar();
    toast('Treino duplicado no mesmo dia — arraste para onde quiser');
  };

  $('#btnToLibrary').onclick = () => {
    if (!saveTemplateFromForm(null)) return;
    db.libraryOpen = true;
    saveDB(); renderLibrary();
    toast('Salvo na biblioteca');
  };

  // Biblioteca
  const filters = $('#libFilters');
  [['all', 'Todos'], ...SPORT_KEYS.map(k => [k, SPORTS[k].label])].forEach(([k, label]) => {
    const c = el('button', 'chip', label);
    c.type = 'button';
    c.dataset.filter = k;
    c.onclick = () => { libFilter = k; renderLibrary(); };
    filters.append(c);
  });
  $('#libSearch').addEventListener('input', renderLibrary);
  $('#btnLibrary').onclick = () => setLibraryOpen(!db.libraryOpen);
  $('#btnLibClose').onclick = () => setLibraryOpen(false);
  $('#btnLibNew').onclick = () => openTemplate(null);

  // Exportar
  $('#btnExport').onclick = () => {
    setExportRange('week');
    $('#exPreview').innerHTML = '<p class="muted">Escolha o período e clique em <b>Gerar imagem</b>.</p>';
    $('#btnDownload').disabled = true;
    $('#btnShareImg').hidden = true;
    lastBlob = null;
    $('#exportDialog').showModal();
  };
  $$('[data-preset]').forEach(b => (b.onclick = () => { setExportRange(b.dataset.preset); generateImage(); }));
  $('#btnGen').onclick = generateImage;
  $('#btnDownload').onclick = () => lastBlob && downloadBlob(lastBlob, lastName);
  $('#btnShareImg').onclick = async () => {
    if (!lastBlob) return;
    try { await navigator.share({ files: [new File([lastBlob], lastName, { type: 'image/png' })], title: 'Plano de treino' }); }
    catch (e) { /* cancelado */ }
  };

  // Link
  $('#btnShare').onclick = async () => {
    const code = await encodePlan(athlete());
    const url = `${location.origin}${location.pathname}${SHARE_PREFIX}${code}`;
    $('#shareLink').value = url;
    $('#btnWhats').href = `https://wa.me/?text=${encodeURIComponent(`Seu plano de treino: ${url}`)}`;
    $('#shareDialog').showModal();
  };
  $('#btnCopyLink').onclick = async () => {
    try { await navigator.clipboard.writeText($('#shareLink').value); toast('Link copiado'); }
    catch (e) { $('#shareLink').select(); document.execCommand('copy'); toast('Link copiado'); }
  };

  // Plano compartilhado → salvar
  $('#btnSaveShared').onclick = () => {
    const shared = athlete();
    const mine = loadDB();
    const a = { id: uid(), name: shared.name, workouts: shared.workouts.map(w => ({ ...w, id: uid() })) };
    mine.athletes.push(a);
    mine.currentId = a.id;
    try { localStorage.setItem(STORE_KEY, JSON.stringify(mine)); } catch (e) { toast('Não foi possível salvar'); return; }
    location.href = location.pathname;
  };
}

/* ================= Início ================= */
async function init() {
  if (location.hash.startsWith(SHARE_PREFIX)) {
    try {
      const shared = await decodePlan(location.hash.slice(SHARE_PREFIX.length));
      db = { athletes: [shared], currentId: shared.id };
      readOnly = true;
      document.body.classList.add('readonly');
      $('#readonlyBanner').hidden = false;
    } catch (e) {
      console.error(e);
      toast('Link de plano inválido');
    }
  }
  if (!db) db = loadDB();
  renderLegend($('#legend'));
  bindEvents();
  render();
}
init();
