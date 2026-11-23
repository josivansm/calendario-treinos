'use strict';
/* =====================================================================
   Treino estruturado em blocos
   steps = [
     { t: 'step', kind: 'warmup'|'steady'|'work'|'recovery'|'cooldown', value: 15, unit: 'min'|'s'|'km'|'m', zone: 'Z1'..'Z5'|'', note: '' },
     { t: 'repeat', n: 6, steps: [ ...steps (sem repetição dentro) ] },
   ]
   ===================================================================== */

const STEP_KINDS = {
  warmup:   { label: 'Aquecimento',    short: 'Aquec.' },
  steady:   { label: 'Contínuo',       short: 'Contínuo' },
  work:     { label: 'Esforço',        short: 'Forte' },
  recovery: { label: 'Recuperação',    short: 'Recup.' },
  cooldown: { label: 'Desaquecimento', short: 'Desaquec.' },
};
const STEP_UNITS = {
  min: { label: 'min', time: true },
  s:   { label: 's',   time: true },
  km:  { label: 'km',  time: false },
  m:   { label: 'm',   time: false },
};
const ZONE_COLORS = { '': '#b9c4d0', Z1: '#8fb3d9', Z2: '#3fae6a', Z3: '#f2c230', Z4: '#f28c28', Z5: '#e5484d' };
const ZONE_HEIGHT = { '': 0.25, Z1: 0.25, Z2: 0.42, Z3: 0.6, Z4: 0.8, Z5: 1 };
const MAX_STEPS = 60;

/* ---------- Validação ---------- */
function sanitizeStep(s) {
  if (!s || typeof s !== 'object') return null;
  const unit = STEP_UNITS[s.unit] ? s.unit : 'min';
  const max = { min: 600, s: 3600, km: 300, m: 20000 }[unit];
  const value = Math.min(max, Math.max(0, Math.round((+s.value || 0) * 100) / 100));
  return {
    t: 'step',
    kind: STEP_KINDS[s.kind] ? s.kind : 'steady',
    value,
    unit,
    zone: ['', 'Z1', 'Z2', 'Z3', 'Z4', 'Z5'].includes(s.zone) ? s.zone : '',
    note: String(s.note || '').slice(0, 80),
  };
}
function sanitizeSteps(list) {
  if (!Array.isArray(list) || !list.length) return null;
  const out = [];
  let count = 0;
  for (const s of list) {
    if (count >= MAX_STEPS) break;
    if (s && s.t === 'repeat') {
      const inner = (Array.isArray(s.steps) ? s.steps : []).filter(x => x && x.t !== 'repeat').map(sanitizeStep).filter(Boolean).slice(0, 10);
      if (!inner.length) continue;
      out.push({ t: 'repeat', n: Math.min(50, Math.max(1, Math.round(+s.n || 1))), steps: inner });
      count += inner.length;
    } else {
      const st = sanitizeStep(s);
      if (st) { out.push(st); count++; }
    }
  }
  return out.length ? out : null;
}

/* ---------- Estimativas (tempo ⇄ distância pela zona) ---------- */
// segundos por km na corrida, segundos por 100 m na natação, km/h no ciclismo
function paceFor(sport, zone, zones) {
  const z = zone || 'Z2';
  if (sport === 'run') {
    const T = (zones && zones.runPace) || 330; // 5:30/km se não tiver zona cadastrada
    const f = { Z1: 1.35, Z2: 1.2, Z3: 1.1, Z4: 1.02, Z5: 0.95 }[z];
    return { secPerKm: T * f };
  }
  if (sport === 'swim') {
    const C = (zones && zones.cssPace) || 150; // 2:30/100 m
    const add = { Z1: 20, Z2: 11, Z3: 5, Z4: 0, Z5: -4 }[z];
    return { secPerKm: (C + add) * 10 };
  }
  const kmh = { Z1: 22, Z2: 27, Z3: 30, Z4: 33, Z5: 36 }[z];
  return { secPerKm: 3600 / kmh };
}
// devolve { sec, km } de um passo (o que não foi dado é estimado)
function stepAmounts(step, sport, zones) {
  const { secPerKm } = paceFor(sport, step.zone, zones);
  if (step.unit === 'min') return { sec: step.value * 60, km: (step.value * 60) / secPerKm, estKm: true };
  if (step.unit === 's') return { sec: step.value, km: step.value / secPerKm, estKm: true };
  const km = step.unit === 'km' ? step.value : step.value / 1000;
  return { sec: km * secPerKm, km, estSec: true };
}
function flattenSteps(steps) {
  const out = [];
  (steps || []).forEach(s => {
    if (s.t === 'repeat') for (let i = 0; i < s.n; i++) s.steps.forEach(x => out.push(x));
    else out.push(s);
  });
  return out;
}
function stepsTotals(steps, sport, zones) {
  let sec = 0, km = 0, estimated = false;
  flattenSteps(steps).forEach(s => {
    const a = stepAmounts(s, sport, zones);
    sec += a.sec; km += a.km;
    if (a.estKm || a.estSec) estimated = true;
  });
  return { minutes: Math.round(sec / 60), km: Math.round(km * 100) / 100, estimated };
}

/* ---------- Texto automático ---------- */
function fmtStepValue(s) {
  if (s.unit === 'km') return `${s.value.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} km`;
  if (s.unit === 'm') return `${Math.round(s.value).toLocaleString('pt-BR')} m`;
  if (s.unit === 's') return `${Math.round(s.value)} s`;
  const v = s.value;
  return v >= 60 && v % 60 === 0 ? `${v / 60}h` : v >= 60 ? `${Math.floor(v / 60)}h${String(Math.round(v % 60)).padStart(2, '0')}` : `${v.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} min`;
}
function stepText(s, withKind) {
  const parts = [fmtStepValue(s)];
  if (s.zone) parts.push(s.zone);
  let txt = parts.join(' ');
  if (withKind) txt = `${STEP_KINDS[s.kind].label}: ${txt}`;
  else if (s.kind === 'recovery') txt += ' recuperação';
  if (s.note) txt += ` (${s.note})`;
  return txt;
}
function stepsToText(steps) {
  return (steps || []).map(s => {
    if (s.t === 'repeat') return `${s.n} × (${s.steps.map(x => stepText(x, false)).join(' / ')})`;
    return stepText(s, true);
  }).join('\n');
}

/* ---------- Gráfico de intensidade (SVG) ---------- */
function stepsChart(steps, sport, zones, opts = {}) {
  const h = opts.height || 40;
  const W = 1000; // largura lógica; o SVG estica para a largura do cartão
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'steps-chart');
  svg.setAttribute('role', 'img');
  svg.style.height = `${h}px`;
  const flat = flattenSteps(steps);
  const secs = flat.map(s => Math.max(1, stepAmounts(s, sport, zones).sec));
  const total = secs.reduce((a, b) => a + b, 0) || 1;
  const gap = flat.length > 1 ? Math.min(6, 200 / flat.length) : 0;
  let x = 0;
  const label = [];
  flat.forEach((s, i) => {
    const w = (secs[i] / total) * W;
    const bh = Math.max(3, ZONE_HEIGHT[s.zone] * h);
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', (x + gap / 2).toFixed(1));
    r.setAttribute('y', (h - bh).toFixed(1));
    r.setAttribute('width', Math.max(1, w - gap).toFixed(1));
    r.setAttribute('height', bh.toFixed(1));
    r.setAttribute('fill', ZONE_COLORS[s.zone]);
    r.setAttribute('rx', '2');
    svg.append(r);
    x += w;
    label.push(`${STEP_KINDS[s.kind].label} ${fmtStepValue(s)}${s.zone ? ' ' + s.zone : ''}`);
  });
  svg.setAttribute('aria-label', `Gráfico de intensidade: ${label.slice(0, 8).join(', ')}${label.length > 8 ? '…' : ''}`);
  return svg;
}

/* ---------- Editor no formulário ---------- */
let editSteps = null; // cópia em edição

function defaultSteps(sport) {
  const far = sport === 'swim' ? { unit: 'm', value: 200 } : { unit: 'min', value: 10 };
  return [
    { t: 'step', kind: 'warmup', ...far, zone: 'Z1', note: '' },
    { t: 'repeat', n: 4, steps: [
      { t: 'step', kind: 'work', unit: sport === 'swim' ? 'm' : 'min', value: sport === 'swim' ? 100 : 4, zone: 'Z4', note: '' },
      { t: 'step', kind: 'recovery', unit: sport === 'swim' ? 's' : 'min', value: sport === 'swim' ? 20 : 2, zone: 'Z1', note: '' },
    ] },
    { t: 'step', kind: 'cooldown', ...far, zone: 'Z1', note: '' },
  ];
}

function optionList(sel, entries, value) {
  entries.forEach(([v, l]) => { const o = el('option', null, l); o.value = v; o.selected = v === value; sel.append(o); });
  return sel;
}

function stepRow(step, onChange, onRemove, onMove) {
  const row = el('div', 'st-row');
  row.style.setProperty('--zc', ZONE_COLORS[step.zone]);
  const kind = optionList(el('select', 'st-kind'), Object.entries(STEP_KINDS).map(([k, v]) => [k, v.label]), step.kind);
  kind.setAttribute('aria-label', 'Tipo');
  kind.onchange = () => { step.kind = kind.value; onChange(); };
  const val = el('input', 'st-val');
  val.type = 'number'; val.min = '0'; val.step = 'any'; val.value = step.value || ''; val.setAttribute('aria-label', 'Quantidade');
  val.oninput = () => { step.value = +val.value || 0; onChange(true); };
  const unit = optionList(el('select', 'st-unit'), Object.entries(STEP_UNITS).map(([k, v]) => [k, v.label]), step.unit);
  unit.setAttribute('aria-label', 'Unidade');
  unit.onchange = () => { step.unit = unit.value; onChange(); };
  const zone = optionList(el('select', 'st-zone'), ZONES.map(([v]) => [v, v || '—']), step.zone);
  zone.setAttribute('aria-label', 'Zona');
  zone.onchange = () => { step.zone = zone.value; row.style.setProperty('--zc', ZONE_COLORS[step.zone]); onChange(); };
  const note = el('input', 'st-note');
  note.type = 'text'; note.maxLength = 80; note.placeholder = 'obs. (ex.: pace 4:50)'; note.value = step.note || '';
  note.oninput = () => { step.note = note.value; onChange(true); };
  const tools = el('span', 'st-tools');
  [['↑', 'Subir', -1], ['↓', 'Descer', 1]].forEach(([t, title, d]) => {
    const b = el('button', 'st-btn', t); b.type = 'button'; b.title = title; b.onclick = () => onMove(d); tools.append(b);
  });
  const del = el('button', 'st-btn del', '✕'); del.type = 'button'; del.title = 'Remover'; del.onclick = onRemove;
  tools.append(del);
  row.append(kind, val, unit, zone, note, tools);
  return row;
}

function renderStepsEditor() {
  const box = $('#stepsEditor');
  box.innerHTML = '';
  const list = editSteps;
  const changed = soft => { updateStepsPreview(); if (!soft) renderStepsEditor(); };
  const move = (arr, i, d) => { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; changed(); };

  list.forEach((s, i) => {
    if (s.t === 'repeat') {
      const grp = el('div', 'st-repeat');
      const head = el('div', 'st-rep-head');
      head.append(el('span', null, 'Repetir'));
      const n = el('input', 'st-n'); n.type = 'number'; n.min = '1'; n.max = '50'; n.value = s.n; n.setAttribute('aria-label', 'Repetições');
      n.oninput = () => { s.n = Math.min(50, Math.max(1, Math.round(+n.value || 1))); changed(true); };
      head.append(n, el('span', null, 'vezes'));
      const add = el('button', 'chip', '+ passo'); add.type = 'button';
      add.onclick = () => { s.steps.push({ t: 'step', kind: 'recovery', value: 1, unit: 'min', zone: 'Z1', note: '' }); changed(); };
      const tools = el('span', 'st-tools');
      [['↑', 'Subir', -1], ['↓', 'Descer', 1]].forEach(([t, title, d]) => {
        const b = el('button', 'st-btn', t); b.type = 'button'; b.title = title; b.onclick = () => move(list, i, d); tools.append(b);
      });
      const del = el('button', 'st-btn del', '✕'); del.type = 'button'; del.title = 'Remover repetição';
      del.onclick = () => { list.splice(i, 1); changed(); };
      tools.append(del);
      head.append(add, tools);
      grp.append(head);
      s.steps.forEach((x, k) => grp.append(stepRow(x, changed, () => { s.steps.splice(k, 1); if (!s.steps.length) list.splice(i, 1); changed(); }, d => move(s.steps, k, d))));
      box.append(grp);
    } else {
      box.append(stepRow(s, changed, () => { list.splice(i, 1); changed(); }, d => move(list, i, d)));
    }
  });
  const add = el('div', 'st-add');
  const sport = currentSport;
  const unitDefault = sport === 'swim' ? 'm' : 'min';
  [['+ Aquecimento', () => ({ t: 'step', kind: 'warmup', value: sport === 'swim' ? 200 : 10, unit: unitDefault, zone: 'Z1', note: '' })],
   ['+ Passo', () => ({ t: 'step', kind: 'steady', value: sport === 'swim' ? 400 : 20, unit: unitDefault, zone: 'Z2', note: '' })],
   ['+ Repetição', () => ({ t: 'repeat', n: 4, steps: [
      { t: 'step', kind: 'work', value: sport === 'swim' ? 100 : 400, unit: 'm', zone: 'Z4', note: '' },
      { t: 'step', kind: 'recovery', value: sport === 'swim' ? 20 : 200, unit: sport === 'swim' ? 's' : 'm', zone: 'Z1', note: '' }] })],
   ['+ Desaquecimento', () => ({ t: 'step', kind: 'cooldown', value: sport === 'swim' ? 200 : 10, unit: unitDefault, zone: 'Z1', note: '' })],
  ].forEach(([label, make]) => {
    const b = el('button', 'chip', label); b.type = 'button';
    b.onclick = () => { if (list.length >= MAX_STEPS) return; list.push(make()); changed(); };
    add.append(b);
  });
  box.append(add);
  updateStepsPreview();
}

// gráfico + totais + texto + campos de duração/distância
function updateStepsPreview() {
  const chartBox = $('#stepsChart'), totalBox = $('#stepsTotal');
  chartBox.innerHTML = '';
  totalBox.textContent = '';
  const steps = editSteps && sanitizeSteps(editSteps);
  chartBox.hidden = !steps;
  totalBox.hidden = !steps;
  if (!steps) return;
  const zones = athlete().zones;
  chartBox.append(stepsChart(steps, currentSport, zones, { height: 56 }));
  const t = stepsTotals(steps, currentSport, zones);
  const dist = currentSport === 'swim' ? `${Math.round(t.km * 1000).toLocaleString('pt-BR')} m` : `${t.km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km`;
  totalBox.textContent = `${t.estimated ? 'Total estimado' : 'Total'}: ${fmtDuration(t.minutes) || '0min'} · ${dist}`;
  if ($('#stepsMode').dataset.mode === 'blocks' && !readOnly) {
    $('#wDuration').value = durInput(t.minutes);
    $('#wDistance').value = currentSport === 'swim' ? Math.round(t.km * 1000) : Math.round(t.km * 10) / 10;
    $('#wDesc').value = stepsToText(steps);
  }
}

function setStepsMode(mode, src) {
  const box = $('#stepsMode');
  box.dataset.mode = mode;
  $$('#stepsMode [data-mode]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.mode === mode)));
  const blocks = mode === 'blocks';
  $('#stepsEditor').hidden = !blocks || readOnly;
  $('#wDesc').hidden = blocks && !readOnly;
  $('#btnStructure').hidden = blocks;
  $('#stepsAuto').hidden = !blocks || readOnly;
  if (blocks) {
    editSteps = JSON.parse(JSON.stringify(src || editSteps || defaultSteps(currentSport)));
    if (!readOnly) renderStepsEditor(); else updateStepsPreview();
  } else {
    editSteps = null;
    updateStepsPreview();
  }
}

// chamado ao abrir o formulário
function loadStepsIntoForm(steps) {
  editSteps = null;
  $('#stepsModeBar').hidden = readOnly && !steps;
  setStepsMode(steps ? 'blocks' : 'text', steps);
}
const readStepsFromForm = () => ($('#stepsMode').dataset.mode === 'blocks' ? sanitizeSteps(editSteps) : null);
