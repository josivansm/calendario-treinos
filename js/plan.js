'use strict';
/* =====================================================================
   Plano da atleta: provas, fases, gerar semanas, carga e evolução.
   athlete.plan = {
     events: [{ id, date, name, sport, priority: 'A'|'B'|'C', distance, notes }],
     phases: [{ id, start, end, kind, note }],
   }
   ===================================================================== */

const PHASES = {
  base:       { label: 'Base',        color: '#e3eefb', ink: '#1d4f91' },
  build:      { label: 'Construção',  color: '#fdebdc', ink: '#9a4a12' },
  peak:       { label: 'Pico',        color: '#fbe0ea', ink: '#9b2457' },
  taper:      { label: 'Polimento',   color: '#e2f4ea', ink: '#1c6b40' },
  recovery:   { label: 'Recuperação', color: '#eeeef3', ink: '#4a4f63' },
  transition: { label: 'Transição',   color: '#f3f0e6', ink: '#6b5d2e' },
};
const EVENT_SPORTS = { tri: 'Triathlon', run: 'Corrida', bike: 'Ciclismo', swim: 'Natação', duathlon: 'Duathlon', other: 'Outra' };
// cores dos gráficos (paleta validada para daltonismo; os ícones mantêm as cores próprias)
const CHART_COLORS = { run: '#eb6834', bike: '#1baf7a', swim: '#2a78d6', planned: '#c9d1db', ctl: '#2563eb', atl: '#db2777' };

const isoOk = s => /^\d{4}-\d{2}-\d{2}$/.test(s || '');

/* ---------- Validação ---------- */
function sanitizePlan(p) {
  p = p && typeof p === 'object' ? p : {};
  const events = (Array.isArray(p.events) ? p.events : []).filter(e => e && isoOk(e.date)).slice(0, 60).map(e => ({
    id: safeId(e.id) || uid(),
    date: e.date,
    name: String(e.name || 'Prova').slice(0, 60),
    sport: EVENT_SPORTS[e.sport] ? e.sport : 'run',
    priority: ['A', 'B', 'C'].includes(e.priority) ? e.priority : 'B',
    distance: String(e.distance || '').slice(0, 40),
    notes: String(e.notes || '').slice(0, 300),
  }));
  const phases = (Array.isArray(p.phases) ? p.phases : []).filter(f => f && isoOk(f.start) && isoOk(f.end)).slice(0, 60).map(f => ({
    id: safeId(f.id) || uid(),
    start: f.start <= f.end ? f.start : f.end,
    end: f.start <= f.end ? f.end : f.start,
    kind: PHASES[f.kind] ? f.kind : 'base',
    note: String(f.note || '').slice(0, 60),
  }));
  events.sort((a, b) => a.date.localeCompare(b.date));
  phases.sort((a, b) => a.start.localeCompare(b.start));
  return { events, phases };
}
const planOf = a => (a.plan = a.plan && Array.isArray(a.plan.events) ? a.plan : sanitizePlan(a.plan));

/* ---------- Consultas ---------- */
function eventsOn(a, date) { return planOf(a).events.filter(e => e.date === date); }
// fase da semana: a que cobre a quinta-feira (meio da semana)
function phaseForWeek(a, weekStart) {
  const mid = iso(addDays(weekStart, 3));
  return planOf(a).phases.find(f => f.start <= mid && mid <= f.end) || null;
}
// posição da semana dentro da fase: "Base 2/4"
function phaseWeekLabel(f, weekStart) {
  const s = startOfWeek(parseISO(f.start)), e = startOfWeek(parseISO(f.end));
  const total = Math.round((e - s) / (7 * 864e5)) + 1;
  const n = Math.round((weekStart - s) / (7 * 864e5)) + 1;
  return `${PHASES[f.kind].label} ${Math.min(Math.max(n, 1), total)}/${total}`;
}
function nextRace(a) {
  const today = iso(new Date());
  const up = planOf(a).events.filter(e => e.date >= today);
  return up.find(e => e.priority === 'A') || up[0] || null;
}
const daysUntil = date => Math.round((parseISO(date) - parseISO(iso(new Date()))) / 864e5);

/* ---------- Calendário: cartão da prova, fase da semana, contagem ---------- */
function eventCard(ev) {
  const c = el('div', `ev ev-${ev.priority}`);
  const head = el('div', 'ev-head');
  head.append(el('span', 'ev-flag', '🏁'), el('span', 'ev-name', ev.name));
  c.append(head);
  const meta = el('div', 'ev-meta');
  meta.append(el('b', `ev-prio`, `Prova ${ev.priority}`), el('span', null, [EVENT_SPORTS[ev.sport], ev.distance].filter(Boolean).join(' · ')));
  c.append(meta);
  if (ev.notes) c.append(el('div', 'ev-notes', ev.notes));
  c.title = 'Prova';
  if (!readOnly) {
    c.tabIndex = 0;
    c.addEventListener('click', () => openPlan('events', ev.id));
  }
  return c;
}

function renderCountdown() {
  const box = $('#raceCountdown');
  if (!box) return;
  const ev = db && athlete() ? nextRace(athlete()) : null;
  box.hidden = !ev;
  if (!ev) return;
  const d = daysUntil(ev.date);
  const when = d === 0 ? 'é hoje!' : d === 1 ? 'é amanhã' : `faltam ${d} dias (${Math.floor(d / 7)} sem. e ${d % 7} d)`;
  box.innerHTML = '';
  box.append(el('span', 'cd-flag', '🏁'), el('b', null, ev.name), el('span', 'cd-prio', `Prova ${ev.priority}`),
    el('span', null, `${fmtDMY(parseISO(ev.date))} · ${when}`));
}

/* ---------- Carga (TSS estimado) ---------- */
const IF_ZONE = { '': 0.7, Z1: 0.6, Z2: 0.72, Z3: 0.83, Z4: 0.95, Z5: 1.05 };
const ifFromRpe = rpe => 0.45 + rpe * 0.065; // esforço 1 → 0,52 · 5 → 0,78 · 10 → 1,10
function plannedTSS(w, zones) {
  if (w.steps) {
    return flattenSteps(w.steps).reduce((s, st) => {
      const sec = stepAmounts(st, w.sport, zones).sec;
      const f = IF_ZONE[st.zone] || 0.7;
      return s + (sec / 3600) * f * f * 100;
    }, 0);
  }
  const f = IF_ZONE[w.zone] || 0.7;
  return (w.duration / 60) * f * f * 100;
}
function doneTSS(w, zones) {
  const r = w.result;
  if (!r || !r.done) return 0;
  const min = r.duration || w.duration;
  if (r.rpe) { const f = ifFromRpe(r.rpe); return (min / 60) * f * f * 100; }
  const p = plannedTSS(w, zones);
  return w.duration ? p * (min / w.duration) : p;
}

// série diária: carga feita no passado e planejada daqui para frente
function loadSeries(a, from, to) {
  const zones = a.zones;
  const today = iso(new Date());
  const byDay = {};
  a.workouts.forEach(w => {
    const d = (byDay[w.date] = byDay[w.date] || { done: 0, plan: 0 });
    d.plan += plannedTSS(w, zones);
    d.done += doneTSS(w, zones);
  });
  let ctl = 0, atl = 0;
  const warm = addDays(from, -84); // aquece a curva com 12 semanas antes do início
  const out = [];
  for (let d = warm; d <= to; d = addDays(d, 1)) {
    const key = iso(d);
    const day = byDay[key] || { done: 0, plan: 0 };
    const future = key > today;
    const tss = future ? day.plan : day.done;
    const tsb = ctl - atl; // forma de manhã (antes do treino do dia)
    ctl += (tss - ctl) / 42;
    atl += (tss - atl) / 7;
    if (d >= from) out.push({ date: key, tss, ctl, atl, tsb, future });
  }
  return out;
}
function formLabel(tsb) {
  if (tsb > 15) return 'bem descansada (pode estar perdendo condicionamento)';
  if (tsb > 5) return 'descansada, boa para prova';
  if (tsb >= -10) return 'equilibrada';
  if (tsb >= -25) return 'treinando forte (cansaço produtivo)';
  return 'muito cansada (risco de excesso)';
}
const weekTSS = (list, zones) => Math.round(list.reduce((s, w) => s + plannedTSS(w, zones), 0));

/* ---------- Gráficos (SVG) ---------- */
const SVGNS = 'http://www.w3.org/2000/svg';
function svgEl(tag, attrs, text) {
  const e = document.createElementNS(SVGNS, tag);
  Object.entries(attrs || {}).forEach(([k, v]) => e.setAttribute(k, v));
  if (text != null) e.textContent = text;
  return e;
}
function niceMax(v) {
  if (v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  return [1, 2, 2.5, 5, 10].map(m => m * p).find(m => m >= v);
}
function attachTooltip(svg, wrap, hits) {
  const tip = el('div', 'viz-tip');
  tip.hidden = true;
  wrap.append(tip);
  hits.forEach(({ rect, html, x }) => {
    const show = () => {
      tip.innerHTML = '';
      html.forEach(([label, value, color]) => {
        const row = el('div', 'viz-tip-row');
        if (color) { const sw = el('span', 'viz-sw'); sw.style.background = color; row.append(sw); }
        row.append(el('span', null, label));
        if (value != null) row.append(el('b', null, value));
        tip.append(row);
      });
      tip.hidden = false;
      const box = wrap.getBoundingClientRect(), r = svg.getBoundingClientRect();
      const px = (x / svg.viewBox.baseVal.width) * r.width + (r.left - box.left);
      tip.style.left = `${Math.min(Math.max(px - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
    };
    rect.addEventListener('mouseenter', show);
    rect.addEventListener('focus', show);
    rect.addEventListener('mouseleave', () => (tip.hidden = true));
    rect.addEventListener('blur', () => (tip.hidden = true));
  });
}

// Volume semanal: barra cinza = planejado, barra empilhada colorida = feito
function volumeChart(weeks) {
  const W = 820, H = 240, L = 44, R = 10, T = 12, B = 34;
  const max = niceMax(Math.max(1, ...weeks.map(w => Math.max(w.plannedH, w.doneH))));
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz', role: 'img', 'aria-label': 'Volume semanal em horas: planejado e feito por modalidade' });
  const y = v => T + (1 - v / max) * (H - T - B);
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'viz-grid' }));
    svg.append(svgEl('text', { x: L - 6, y: y(v) + 4, class: 'viz-axis', 'text-anchor': 'end' }, `${Math.round(v * 10) / 10}h`));
  }
  const band = (W - L - R) / weeks.length;
  const bw = Math.min(22, band * 0.32);
  const hits = [];
  const today = iso(startOfWeek(new Date()));
  weeks.forEach((w, i) => {
    const cx = L + band * i + band / 2;
    // planejado
    if (w.plannedH > 0) svg.append(roundTopRect(cx - bw - 1, y(w.plannedH), bw, y(0) - y(w.plannedH), CHART_COLORS.planned));
    // feito, empilhado por modalidade com 2px de separação
    let acc = 0;
    SPORT_KEYS.forEach(k => {
      const v = w.done[k];
      if (!v) return;
      const top = y(acc + v), bottom = y(acc);
      const isTop = SPORT_KEYS.slice(SPORT_KEYS.indexOf(k) + 1).every(o => !w.done[o]);
      svg.append(isTop ? roundTopRect(cx + 1, top, bw, bottom - top - (acc ? 2 : 0), CHART_COLORS[k])
        : svgEl('rect', { x: cx + 1, y: top, width: bw, height: Math.max(0, bottom - top - (acc ? 2 : 0)), fill: CHART_COLORS[k] }));
      acc += v;
    });
    // eixo x: dia/mês do início da semana (rótulos alternados se apertado)
    if (weeks.length <= 14 || i % 2 === 0) {
      svg.append(svgEl('text', { x: cx, y: H - B + 16, class: `viz-axis${w.start === today ? ' viz-now' : ''}`, 'text-anchor': 'middle' }, fmtDM(parseISO(w.start))));
    }
    if (w.phase) svg.append(svgEl('rect', { x: L + band * i + 2, y: H - 10, width: band - 4, height: 4, rx: 2, fill: PHASES[w.phase].ink, opacity: 0.55 }));
    const hit = svgEl('rect', { x: L + band * i, y: T, width: band, height: H - T - B, fill: 'transparent', tabindex: 0 });
    svg.append(hit);
    const rows = [[`Semana de ${fmtDM(parseISO(w.start))}${w.phase ? ' · ' + PHASES[w.phase].label : ''}`, null]];
    rows.push(['Planejado', `${fmtDuration(Math.round(w.plannedH * 60)) || '0'}`, CHART_COLORS.planned]);
    SPORT_KEYS.forEach(k => { if (w.done[k]) rows.push([`${SPORTS[k].label} feito`, fmtDuration(Math.round(w.done[k] * 60)), CHART_COLORS[k]]); });
    rows.push(['Carga', `${w.tssDone} feita · ${w.tssPlan} plan.`]);
    hits.push({ rect: hit, html: rows, x: cx });
  });
  svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'viz-base' }));
  return { svg, hits };
}
function roundTopRect(x, yTop, w, h, fill) {
  h = Math.max(0, h);
  const r = Math.min(4, w / 2, h);
  const d = `M${x},${yTop + h} V${yTop + r} Q${x},${yTop} ${x + r},${yTop} H${x + w - r} Q${x + w},${yTop} ${x + w},${yTop + r} V${yTop + h} Z`;
  return svgEl('path', { d, fill });
}

// Condicionamento (CTL) e fadiga (ATL): linhas; o futuro tracejado
function formChart(series, a) {
  const W = 820, H = 240, L = 44, R = 10, T = 12, B = 34;
  const max = niceMax(Math.max(10, ...series.map(s => Math.max(s.ctl, s.atl))));
  const n = series.length;
  const x = i => L + (i / Math.max(1, n - 1)) * (W - L - R);
  const y = v => T + (1 - v / max) * (H - T - B);
  const svg = svgEl('svg', { viewBox: `0 0 ${W} ${H}`, class: 'viz', role: 'img', 'aria-label': 'Condicionamento e fadiga por dia' });
  // faixas de fase ao fundo
  planOf(a).phases.forEach(f => {
    const i0 = series.findIndex(s => s.date >= f.start), i1 = series.map(s => s.date <= f.end).lastIndexOf(true);
    if (i0 < 0 || i1 < 0 || i1 < i0) return;
    svg.append(svgEl('rect', { x: x(i0), y: T, width: Math.max(1, x(i1) - x(i0)), height: H - T - B, fill: PHASES[f.kind].color }));
    svg.append(svgEl('text', { x: x(i0) + 4, y: T + 12, class: 'viz-phase', fill: PHASES[f.kind].ink }, PHASES[f.kind].label));
  });
  for (let i = 0; i <= 4; i++) {
    const v = (max / 4) * i;
    svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(v), y2: y(v), class: 'viz-grid' }));
    svg.append(svgEl('text', { x: L - 6, y: y(v) + 4, class: 'viz-axis', 'text-anchor': 'end' }, String(Math.round(v))));
  }
  // meses no eixo x
  series.forEach((s, i) => {
    if (s.date.endsWith('-01') || i === 0) {
      const d = parseISO(s.date);
      svg.append(svgEl('text', { x: x(i) + 2, y: H - B + 16, class: 'viz-axis' }, `${MON_SHORT[d.getMonth()]}`));
    }
  });
  const pastIdx = [], futIdx = [];
  series.forEach((s, i) => (s.future ? futIdx : pastIdx).push(i));
  const lastPast = pastIdx[pastIdx.length - 1];
  const line = (idx, key) => idx.map((i, k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(series[i][key]).toFixed(1)}`).join(' ');
  ['ctl', 'atl'].forEach(k => {
    const past = pastIdx.length > 1 ? line(pastIdx, k) : '';
    const fut = futIdx.length ? line(lastPast != null ? [lastPast, ...futIdx] : futIdx, k) : '';
    if (past) svg.append(svgEl('path', { d: past, fill: 'none', stroke: CHART_COLORS[k], 'stroke-width': 2, 'stroke-linejoin': 'round' }));
    if (fut) svg.append(svgEl('path', { d: fut, fill: 'none', stroke: CHART_COLORS[k], 'stroke-width': 2, 'stroke-dasharray': '5 4', opacity: 0.8 }));
  });
  // hoje
  const ti = series.findIndex(s => s.date === iso(new Date()));
  if (ti >= 0) {
    svg.append(svgEl('line', { x1: x(ti), x2: x(ti), y1: T, y2: H - B, class: 'viz-today' }));
    svg.append(svgEl('text', { x: x(ti) + 4, y: H - B - 6, class: 'viz-axis viz-now' }, 'hoje'));
  }
  // provas
  planOf(a).events.forEach(ev => {
    const i = series.findIndex(s => s.date === ev.date);
    if (i < 0) return;
    svg.append(svgEl('line', { x1: x(i), x2: x(i), y1: T, y2: H - B, class: 'viz-race' }));
    svg.append(svgEl('text', { x: x(i), y: T + 26, class: 'viz-axis', 'text-anchor': 'middle' }, `🏁 ${ev.priority}`));
  });
  // rótulos diretos no fim das linhas
  const last = series[n - 1];
  if (last) {
    const lc = y(last.ctl), la = y(last.atl);
    const sep = Math.abs(lc - la) < 12 ? (lc < la ? -6 : 6) : 0;
    svg.append(svgEl('text', { x: W - R - 2, y: lc - 6 + (sep < 0 ? sep : 0), class: 'viz-label', 'text-anchor': 'end' }, 'Condicionamento'));
    svg.append(svgEl('text', { x: W - R - 2, y: la + 14 + (sep > 0 ? sep : 0), class: 'viz-label', 'text-anchor': 'end' }, 'Fadiga'));
  }
  svg.append(svgEl('line', { x1: L, x2: W - R, y1: y(0), y2: y(0), class: 'viz-base' }));
  // camada de hover: uma faixa por semana
  const hits = [];
  for (let i = 0; i < n; i += 7) {
    const j = Math.min(n - 1, i + 6);
    const s = series[j];
    const hit = svgEl('rect', { x: x(i), y: T, width: Math.max(2, x(j) - x(i) + 1), height: H - T - B, fill: 'transparent', tabindex: 0 });
    svg.append(hit);
    hits.push({ rect: hit, x: (x(i) + x(j)) / 2, html: [
      [`${fmtDM(parseISO(series[i].date))} a ${fmtDM(parseISO(s.date))}${s.future ? ' (projeção)' : ''}`, null],
      ['Condicionamento', String(Math.round(s.ctl)), CHART_COLORS.ctl],
      ['Fadiga', String(Math.round(s.atl)), CHART_COLORS.atl],
      ['Forma', `${s.tsb >= 0 ? '+' : ''}${Math.round(s.tsb)}`],
    ] });
  }
  return { svg, hits };
}

/* ---------- Tela "Evolução" ---------- */
let evoWeeks = 12;
function openEvolution() {
  renderEvolution();
  $('#evoDialog').showModal();
}
function renderEvolution() {
  const a = athlete();
  const zones = a.zones;
  $('#evoName').textContent = a.name;
  $$('#evoRange [data-weeks]').forEach(b => b.setAttribute('aria-pressed', String(+b.dataset.weeks === evoWeeks)));
  const thisWeek = startOfWeek(new Date());
  const race = nextRace(a);
  let ahead = 6;
  if (race) ahead = Math.min(26, Math.max(2, Math.ceil(daysUntil(race.date) / 7) + 1));
  const from = addDays(thisWeek, -7 * (evoWeeks - 1));
  const to = addDays(thisWeek, 7 * ahead + 6);

  // semanas
  const weeks = [];
  for (let ws = from; ws <= to; ws = addDays(ws, 7)) {
    const s = iso(ws), e = iso(addDays(ws, 6));
    const list = a.workouts.filter(w => w.date >= s && w.date <= e);
    const done = {};
    let doneH = 0;
    list.forEach(w => {
      if (w.result && w.result.done) {
        const h = (w.result.duration || w.duration) / 60;
        done[w.sport] = (done[w.sport] || 0) + h;
        doneH += h;
      }
    });
    const f = phaseForWeek(a, ws);
    weeks.push({
      start: s, list, done, doneH,
      plannedH: list.reduce((t, w) => t + w.duration / 60, 0),
      tssPlan: weekTSS(list, zones),
      tssDone: Math.round(list.reduce((t, w) => t + doneTSS(w, zones), 0)),
      phase: f ? f.kind : null,
    });
  }

  const series = loadSeries(a, from, to);
  const today = series.find(s => s.date === iso(new Date())) || series[series.length - 1];

  // números do dia
  const tiles = $('#evoTiles');
  tiles.innerHTML = '';
  const tile = (label, value, sub) => {
    const t = el('div', 'tile');
    t.append(el('span', 'tile-label', label), el('b', 'tile-value', value), el('span', 'tile-sub', sub));
    tiles.append(t);
  };
  if (today) {
    tile('Condicionamento (CTL)', String(Math.round(today.ctl)), 'média de carga das últimas 6 semanas');
    tile('Fadiga (ATL)', String(Math.round(today.atl)), 'média de carga dos últimos 7 dias');
    tile('Forma (TSB)', `${today.tsb >= 0 ? '+' : ''}${Math.round(today.tsb)}`, formLabel(today.tsb));
  }
  if (race) {
    const rd = series.find(s => s.date === race.date);
    if (rd) tile(`No dia de ${race.name}`, `${rd.tsb >= 0 ? '+' : ''}${Math.round(rd.tsb)}`, `forma projetada · ${formLabel(rd.tsb)}`);
  }

  // gráficos
  const put = (boxId, chart) => {
    const box = $(boxId);
    box.innerHTML = '';
    box.append(chart.svg);
    attachTooltip(chart.svg, box, chart.hits);
  };
  put('#evoVolume', volumeChart(weeks));
  put('#evoForm', formChart(series, a));

  // legenda do volume
  const leg = $('#evoVolLegend');
  leg.innerHTML = '';
  [['Planejado', CHART_COLORS.planned], ...SPORT_KEYS.map(k => [`${SPORTS[k].label} feito`, CHART_COLORS[k]])].forEach(([l, c]) => {
    const s = el('span', 'viz-leg');
    const sw = el('span', 'viz-sw'); sw.style.background = c;
    s.append(sw, l);
    leg.append(s);
  });

  // tabela (mesmos números dos gráficos)
  const tb = $('#evoTable tbody');
  tb.innerHTML = '';
  weeks.slice().reverse().forEach(w => {
    const tr = el('tr');
    const fut = w.start > iso(thisWeek);
    [fmtDM(parseISO(w.start)), w.phase ? PHASES[w.phase].label : '—',
      fmtDuration(Math.round(w.plannedH * 60)) || '—', fut ? '—' : (fmtDuration(Math.round(w.doneH * 60)) || '0'),
      String(w.tssPlan), fut ? '—' : String(w.tssDone)].forEach(v => tr.append(el('td', null, v)));
    if (w.start === iso(thisWeek)) tr.classList.add('now');
    tb.append(tr);
  });
}

/* ---------- Tela "Plano": provas, fases, gerar semanas ---------- */
let planTab = 'events', editingEventId = null, editingPhaseId = null;

function openPlan(tab, eventId) {
  planTab = tab || 'events';
  editingEventId = eventId || null;
  editingPhaseId = null;
  $('#planName').textContent = athlete().name;
  renderPlan();
  if (eventId) fillEventForm(planOf(athlete()).events.find(e => e.id === eventId));
  else { fillEventForm(null); fillPhaseForm(null); }
  resetGenForm();
  $('#planDialog').showModal();
}
function renderPlan() {
  $$('#planTabs [data-tab]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tab === planTab)));
  $$('#planDialog [data-pane]').forEach(p => (p.hidden = p.dataset.pane !== planTab));
  const plan = planOf(athlete());

  const el1 = $('#eventList');
  el1.innerHTML = '';
  if (!plan.events.length) el1.append(el('p', 'muted', 'Nenhuma prova cadastrada.'));
  plan.events.forEach(ev => {
    const row = el('div', `plan-row${ev.id === editingEventId ? ' editing' : ''}`);
    const d = daysUntil(ev.date);
    row.append(el('span', `ev-badge ev-${ev.priority}`, ev.priority),
      el('b', null, ev.name),
      el('span', 'muted', `${fmtDMY(parseISO(ev.date))} · ${[EVENT_SPORTS[ev.sport], ev.distance].filter(Boolean).join(' · ')}${d >= 0 ? ` · em ${d} dias` : ''}`));
    const ed = el('button', 'st-btn', '✎'); ed.type = 'button'; ed.title = 'Editar';
    ed.onclick = () => { editingEventId = ev.id; fillEventForm(ev); renderPlan(); };
    const del = el('button', 'st-btn del', '✕'); del.type = 'button'; del.title = 'Excluir';
    del.onclick = async () => {
      if (!(await ask({ title: `Excluir a prova "${ev.name}"?`, ok: 'Excluir prova', danger: true }))) return;
      plan.events = plan.events.filter(e => e.id !== ev.id);
      if (editingEventId === ev.id) { editingEventId = null; fillEventForm(null); }
      saveDB(); renderPlan(); render();
    };
    const tools = el('span', 'st-tools'); tools.append(ed, del);
    row.append(tools);
    el1.append(row);
  });

  const pl = $('#phaseList');
  pl.innerHTML = '';
  if (!plan.phases.length) pl.append(el('p', 'muted', 'Nenhuma fase cadastrada.'));
  plan.phases.forEach(f => {
    const row = el('div', `plan-row${f.id === editingPhaseId ? ' editing' : ''}`);
    const chip = el('span', 'phase-chip', PHASES[f.kind].label);
    chip.style.background = PHASES[f.kind].color; chip.style.color = PHASES[f.kind].ink;
    const weeks = Math.round((startOfWeek(parseISO(f.end)) - startOfWeek(parseISO(f.start))) / (7 * 864e5)) + 1;
    row.append(chip, el('span', null, `${fmtDM(parseISO(f.start))} a ${fmtDMY(parseISO(f.end))} · ${weeks} sem.${f.note ? ' · ' + f.note : ''}`));
    const ed = el('button', 'st-btn', '✎'); ed.type = 'button'; ed.title = 'Editar';
    ed.onclick = () => { editingPhaseId = f.id; fillPhaseForm(f); renderPlan(); };
    const del = el('button', 'st-btn del', '✕'); del.type = 'button'; del.title = 'Excluir';
    del.onclick = () => { plan.phases = plan.phases.filter(x => x.id !== f.id); if (editingPhaseId === f.id) { editingPhaseId = null; fillPhaseForm(null); } saveDB(); renderPlan(); render(); };
    const tools = el('span', 'st-tools'); tools.append(ed, del);
    row.append(tools);
    pl.append(row);
  });
  const race = nextRace(athlete());
  $('#btnSuggestPhases').disabled = !race;
  $('#suggestHint').textContent = race
    ? `Monta Base → Construção → Pico → Polimento de hoje até ${race.name} (${fmtDM(parseISO(race.date))}).`
    : 'Cadastre uma prova futura para sugerir as fases.';
  updateGenPreview();
}

function fillEventForm(ev) {
  $('#evDate').value = ev ? ev.date : '';
  $('#evName').value = ev ? ev.name : '';
  $('#evSport').value = ev ? ev.sport : 'run';
  $('#evPriority').value = ev ? ev.priority : 'A';
  $('#evDistance').value = ev ? ev.distance : '';
  $('#evNotes').value = ev ? ev.notes : '';
  $('#btnEventSave').textContent = ev ? 'Salvar prova' : '+ Adicionar prova';
  $('#btnEventCancel').hidden = !ev;
}
function fillPhaseForm(f) {
  const ws = startOfWeek(new Date());
  $('#phKind').value = f ? f.kind : 'base';
  $('#phStart').value = f ? f.start : iso(ws);
  $('#phEnd').value = f ? f.end : iso(addDays(ws, 27));
  $('#phNote').value = f ? f.note : '';
  $('#btnPhaseSave').textContent = f ? 'Salvar fase' : '+ Adicionar fase';
  $('#btnPhaseCancel').hidden = !f;
}

function saveEvent() {
  const date = $('#evDate').value, name = $('#evName').value.trim();
  if (!date || !name) { toast('Informe a data e o nome da prova'); return; }
  const plan = planOf(athlete());
  const data = sanitizePlan({ events: [{ id: editingEventId || uid(), date, name, sport: $('#evSport').value, priority: $('#evPriority').value, distance: $('#evDistance').value.trim(), notes: $('#evNotes').value.trim() }] }).events[0];
  if (editingEventId) plan.events = plan.events.map(e => (e.id === editingEventId ? data : e));
  else plan.events.push(data);
  athlete().plan = sanitizePlan(plan);
  editingEventId = null;
  fillEventForm(null);
  saveDB(); renderPlan(); render();
  toast('Prova salva');
}
function savePhase() {
  const start = $('#phStart').value, end = $('#phEnd').value;
  if (!start || !end) { toast('Informe início e fim da fase'); return; }
  const plan = planOf(athlete());
  const data = { id: editingPhaseId || uid(), kind: $('#phKind').value, start, end, note: $('#phNote').value.trim() };
  if (editingPhaseId) plan.phases = plan.phases.map(f => (f.id === editingPhaseId ? data : f));
  else plan.phases.push(data);
  athlete().plan = sanitizePlan(plan);
  editingPhaseId = null;
  fillPhaseForm(null);
  saveDB(); renderPlan(); render();
  toast('Fase salva');
}

// Sugestão: polimento 1–2 semanas, pico 2–3, construção ~40% do restante, base o resto
async function suggestPhases() {
  const race = nextRace(athlete());
  if (!race) return;
  const plan = planOf(athlete());
  const first = startOfWeek(new Date());
  const raceWeek = startOfWeek(parseISO(race.date));
  const weeks = Math.round((raceWeek - first) / (7 * 864e5)) + 1;
  if (weeks < 2) { toast('A prova está perto demais para dividir em fases'); return; }
  if (plan.phases.length && !(await ask({ title: 'Trocar as fases atuais?', text: 'As fases cadastradas serão substituídas pela sugestão.', ok: 'Usar sugestão' }))) return;
  const taper = weeks >= 8 ? 2 : 1;
  const peak = weeks >= 12 ? 3 : weeks >= 6 ? 2 : 0;
  const rest = weeks - taper - peak;
  const build = Math.round(rest * 0.45);
  const base = rest - build;
  const parts = [['base', base], ['build', build], ['peak', peak], ['taper', taper]].filter(p => p[1] > 0);
  let ws = first;
  plan.phases = parts.map(([kind, n]) => {
    const f = { id: uid(), kind, start: iso(ws), end: iso(addDays(ws, 7 * n - 1)), note: '' };
    ws = addDays(ws, 7 * n);
    return f;
  });
  // a última fase termina no dia da prova
  plan.phases[plan.phases.length - 1].end = race.date;
  athlete().plan = sanitizePlan(plan);
  saveDB(); renderPlan(); render();
  toast(`${plan.phases.length} fases criadas até ${race.name}`);
}

/* ---------- Gerar semanas a partir de uma semana-modelo ---------- */
function resetGenForm() {
  const ws = startOfWeek(new Date());
  $('#genSource').value = iso(ws);
  $('#genStart').value = iso(addDays(ws, 7));
  $('#genWeeks').value = 4;
  $('#genPct').value = 5;
  $('#genRecEvery').value = 4;
  $('#genRecPct').value = 30;
  updateGenPreview();
}
function genFactors(n, pct, every, recPct) {
  const out = [];
  let level = 1;
  for (let i = 1; i <= n; i++) {
    if (every && i % every === 0) out.push({ f: level * (1 - recPct / 100), rec: true });
    else { level *= 1 + pct / 100; out.push({ f: level, rec: false }); }
  }
  return out;
}
function genParams() {
  const src = $('#genSource').value, start = $('#genStart').value;
  return {
    src: src ? startOfWeek(parseISO(src)) : null,
    start: start ? startOfWeek(parseISO(start)) : null,
    n: Math.min(16, Math.max(1, Math.round(+$('#genWeeks').value || 1))),
    pct: Math.min(30, Math.max(-30, +$('#genPct').value || 0)),
    every: Math.min(8, Math.max(0, Math.round(+$('#genRecEvery').value || 0))),
    recPct: Math.min(80, Math.max(0, +$('#genRecPct').value || 0)),
  };
}
function sourceWorkouts(src) {
  if (!src) return [];
  const s = iso(src), e = iso(addDays(src, 6));
  return athlete().workouts.filter(w => w.date >= s && w.date <= e);
}
function updateGenPreview() {
  const box = $('#genPreview');
  if (!box) return;
  const p = genParams();
  const list = sourceWorkouts(p.src);
  box.innerHTML = '';
  if (!p.src || !p.start) return;
  if (!list.length) { box.append(el('p', 'muted', `A semana de ${fmtDM(p.src)} não tem treinos para copiar.`)); $('#btnGenerate').disabled = true; return; }
  $('#btnGenerate').disabled = false;
  const base = list.reduce((t, w) => t + w.duration, 0);
  const tbl = el('table', 'gen-table');
  const head = el('tr');
  ['Semana', 'Carga', 'Volume'].forEach(h => head.append(el('th', null, h)));
  tbl.append(head);
  genFactors(p.n, p.pct, p.every, p.recPct).forEach((g, i) => {
    const tr = el('tr', g.rec ? 'rec' : '');
    tr.append(el('td', null, `${fmtDM(addDays(p.start, 7 * i))}${g.rec ? ' · recuperação' : ''}`),
      el('td', null, `${g.f >= 1 ? '+' : ''}${Math.round((g.f - 1) * 100)}%`),
      el('td', null, fmtDuration(Math.round(base * g.f)) || '—'));
    tbl.append(tr);
  });
  box.append(el('p', 'muted', `Modelo: ${list.length} treino(s), ${fmtDuration(base) || '0'} na semana de ${fmtDM(p.src)}.`), tbl);
}
function scaleWorkout(w, f, zones) {
  const copy = JSON.parse(JSON.stringify(w));
  if (copy.steps) {
    flattenSteps(copy.steps); // só para validar
    const scaleStep = s => {
      if (s.kind !== 'steady' && s.kind !== 'work') return;
      const step = { min: 1, s: 5, km: 0.1, m: copy.sport === 'swim' ? 25 : 50 }[s.unit];
      s.value = Math.max(step, Math.round((s.value * f) / step) * step);
      s.value = Math.round(s.value * 100) / 100;
    };
    copy.steps.forEach(s => (s.t === 'repeat' ? s.steps.forEach(scaleStep) : scaleStep(s)));
    const t = stepsTotals(copy.steps, copy.sport, zones);
    copy.duration = t.minutes;
    copy.distance = copy.sport === 'swim' ? Math.round(t.km * 1000) : Math.round(t.km * 10) / 10;
    copy.desc = stepsToText(copy.steps);
  } else {
    copy.duration = Math.round((copy.duration * f) / 5) * 5;
    copy.distance = copy.sport === 'swim' ? Math.round((copy.distance * f) / 50) * 50 : Math.round(copy.distance * f * 10) / 10;
  }
  return copy;
}
async function generateWeeks() {
  const p = genParams();
  const list = sourceWorkouts(p.src);
  if (!list.length || !p.start) return;
  const a = athlete();
  const endTarget = iso(addDays(p.start, 7 * p.n - 1));
  const busy = a.workouts.filter(w => w.date >= iso(p.start) && w.date <= endTarget).length;
  const msg = `${p.n} semana(s) a partir de ${fmtDM(p.start)}, com ${list.length} treino(s) cada.` +
    (busy ? ` Essas semanas já têm ${busy} treino(s): os novos serão somados a eles.` : '');
  if (!(await ask({ title: 'Gerar semanas?', text: msg, ok: 'Gerar' }))) return;
  const factors = genFactors(p.n, p.pct, p.every, p.recPct);
  let count = 0;
  factors.forEach((g, i) => {
    const offsetDays = Math.round((addDays(p.start, 7 * i) - p.src) / 864e5);
    list.forEach(w => {
      const date = iso(addDays(parseISO(w.date), offsetDays));
      const scaled = scaleWorkout(w, g.f, a.zones);
      a.workouts.push(sanitizeWorkout({ ...scaled, id: uid(), date, order: nextOrder(date), result: null }));
      count++;
    });
  });
  saveDB();
  $('#planDialog').close();
  viewDate = startOfMonth(p.start);
  render();
  toast(`${count} treinos criados em ${p.n} semana(s)`);
}

function bindPlanEvents() {
  $('#btnPlan').onclick = () => openPlan('events');
  $('#btnEvolution').onclick = openEvolution;
  $$('#planTabs [data-tab]').forEach(b => (b.onclick = () => { planTab = b.dataset.tab; renderPlan(); }));
  $('#btnEventSave').onclick = saveEvent;
  $('#btnEventCancel').onclick = () => { editingEventId = null; fillEventForm(null); renderPlan(); };
  $('#btnPhaseSave').onclick = savePhase;
  $('#btnPhaseCancel').onclick = () => { editingPhaseId = null; fillPhaseForm(null); renderPlan(); };
  $('#btnSuggestPhases').onclick = suggestPhases;
  ['#genSource', '#genStart', '#genWeeks', '#genPct', '#genRecEvery', '#genRecPct'].forEach(id => $(id).addEventListener('input', updateGenPreview));
  $('#btnGenerate').onclick = generateWeeks;
  $$('#evoRange [data-weeks]').forEach(b => (b.onclick = () => { evoWeeks = +b.dataset.weeks; renderEvolution(); }));
  $('#evoTableToggle').onclick = () => {
    const t = $('#evoTable');
    t.hidden = !t.hidden;
    $('#evoTableToggle').textContent = t.hidden ? 'Ver tabela' : 'Esconder tabela';
  };
}
