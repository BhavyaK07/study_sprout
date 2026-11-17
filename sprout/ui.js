// Sprout screens: sign-in, the tap-to-answer survey, and the four tabs (Today, Week, Stats, Setup).
(() => {
'use strict';
const SP = window.SP, { S, A, WD, SLOTS, DAYSETS } = SP;
const { dk, parseDk, addDays, monday, toMin, fmt, durTxt, todayK, thisWeek, niceDate, rid } = SP;
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const j = v => esc(JSON.stringify(v));
const pct = v => v == null ? '–' : Math.round(v * 100) + '%';
const hrs = m => `${+(m / 60).toFixed(1)} h`;
const PX = 0.9;   // px per minute in the wide week grid
const wide = matchMedia('(min-width: 900px)');
S.ui = { termEdit: null, workCustom: false, wakeCustom: false, endCustom: false, newClass: '', confirm: null, pop: null };

// Goals most people pick, with sensible starting choices.
const CATALOG = [
  { name: 'Workout', icon: '🏋️', minutes: 60, slot: 'evening', days: 'x3' },
  { name: 'Read', icon: '📖', minutes: 20, slot: 'night', days: 'daily' },
  { name: 'Pray', icon: '🙏', minutes: 15, slot: 'morning', days: 'daily' },
  { name: 'Meditate', icon: '🧘', minutes: 10, slot: 'morning', days: 'daily' },
  { name: 'Walk', icon: '🚶', minutes: 30, slot: 'midday', days: 'daily' },
  { name: 'Run', icon: '🏃', minutes: 30, slot: 'morning', days: 'x3' },
  { name: 'Journal', icon: '✍️', minutes: 10, slot: 'night', days: 'daily' },
  { name: 'Stretch', icon: '🤸', minutes: 10, slot: 'morning', days: 'daily' },
  { name: 'Learn a language', icon: '🗣️', minutes: 20, slot: 'evening', days: 'daily' },
  { name: 'Side project', icon: '💻', minutes: 60, slot: 'evening', days: 'x3' },
  { name: 'Practice music', icon: '🎸', minutes: 30, slot: 'evening', days: 'x3' },
  { name: 'Meal prep', icon: '🍳', minutes: 60, slot: 'afternoon', days: [6] },
  { name: 'Call family', icon: '📞', minutes: 20, slot: 'evening', days: 'weekends' },
  { name: 'Tidy up', icon: '🧹', minutes: 15, slot: 'evening', days: 'daily' },
];
const DURS = [10, 15, 20, 30, 45, 60, 90, 120];
const WORK_PRESETS = [['09:00', '17:00'], ['08:00', '16:00'], ['08:30', '16:30'], ['10:00', '18:00']];

const IC = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 21v-9"/><path d="M12 14c0-4.5-3-7-8-7 0 4.5 3 7 8 7z"/><path d="M12 11c0-4 2.5-6.500 7-6.500 0 4-2.500 6.500-7 6.500z"/></svg>',
  plan: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/></svg>',
  stats: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 20v-8M12 20V5M19 20v-5"/></svg>',
  study: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5c2.5-1 5.5-1 8 .5 2.5-1.5 5.5-1.5 8-.5v13c-2.5-1-5.5-1-8 .5-2.5-1.5-5.5-1.5-8-.5z"/><path d="M12 6v13"/></svg>',
  me: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 7h9M17 7h3M4 17h3M11 17h9"/><circle cx="15" cy="7" r="2"/><circle cx="9" cy="17" r="2"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.500l4.500 4.500L19 7"/></svg>',
  chev: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.200" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.400" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  flame: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c1 4 5 6 5 11a5 5 0 0 1-10 0c0-2 1-3.500 2-4.500 0 2 1 3 2 3 0-3-1-6 1-9.500z"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 3l2.600 5.600 6 .700-4.500 4.100 1.200 6L12 16.500 6.700 19.400l1.200-6L3.400 9.300l6-.700z"/></svg>',
  google: '<svg viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.600 20.500H42V20H24v8h11.300C33.700 32.700 29.200 36 24 36c-6.600 0-12-5.400-12-12s5.400-12 12-12c3.100 0 5.800 1.200 7.900 3.100l5.700-5.700C34 6.100 29.300 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.300-.100-2.400-.400-3.500z"/><path fill="#FF3D00" d="M6.300 14.700l6.600 4.800C14.700 15.100 19 12 24 12c3.100 0 5.800 1.200 7.900 3.100l5.700-5.700C34 6.100 29.300 4 24 4 16.300 4 9.700 8.300 6.300 14.700z"/><path fill="#4CAF50" d="M24 44c5.200 0 9.900-2 13.400-5.200l-6.200-5.200C29.200 35.100 26.700 36 24 36c-5.200 0-9.600-3.300-11.300-8l-6.500 5C9.500 39.600 16.200 44 24 44z"/><path fill="#1976D2" d="M43.600 20.500H42V20H24v8h11.300c-.800 2.200-2.200 4.200-4.100 5.600l6.200 5.200C37 39.200 44 34 44 24c0-1.300-.100-2.400-.400-3.500z"/></svg>',
  logo: '<svg viewBox="0 0 32 32" aria-hidden="true"><path d="M16 29V15" stroke="var(--stem)" stroke-width="3" stroke-linecap="round"/><path d="M16 17C16 10 11 6 4 6c0 7 5 11 12 11z" fill="var(--leaf)"/><path d="M16 14c0-6 4-10 11-10 0 6-4 10-11 10z" fill="var(--stem)"/></svg>',
};

// ---------- drawing to the page ----------
const root = { hdr: $('#hdr'), view: $('#view'), tabs: $('#tabs'), sheet: $('#sheet') };
// Replaces a region only when it changed, keeping the cursor and inner scroll where they were.
function patch(el, html) {
  if (!el || el.__h === html) return;
  const act = document.activeElement, id = act && el.contains(act) ? act.id : '';
  let sel = null; try { if (id && act.selectionStart != null) sel = [act.selectionStart, act.selectionEnd]; } catch {}
  const sc = [...el.querySelectorAll('[data-scroll]')].map(n => [n.dataset.scroll, n.scrollTop]);
  el.innerHTML = html; el.__h = html;
  for (const [k, top] of sc) { const n = el.querySelector(`[data-scroll="${k}"]`); if (n) n.scrollTop = top; }
  if (id) { const n = document.getElementById(id); if (n) { n.focus({ preventScroll: true }); try { if (sel) n.setSelectionRange(sel[0], sel[1]); } catch {} } }
}
function patchView(key, regs) {
  const v = root.view;
  if (v.__key !== key) {
    v.__key = key;
    v.innerHTML = regs.map(([id, , cls]) => `<section id="r-${id}" class="${cls || ''}"></section>`).join('');
    v.classList.remove('enter'); void v.offsetWidth; v.classList.add('enter');
    window.scrollTo(0, 0);
  }
  for (const [id, html] of regs) patch(v.querySelector('#r-' + id), html);
}
// Messages queue up so a quest, a level-up and a calendar update can each be read.
const toasts = [];
function toast(msg) { if (toasts[toasts.length - 1] !== msg) toasts.push(msg); if (!toast.on) nextToast(); }
function nextToast() {
  const t = $('#toast'), msg = toasts.shift();
  if (!msg) { toast.on = false; t.hidden = true; return; }
  toast.on = true; t.textContent = msg; t.hidden = false; t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
  setTimeout(nextToast, toasts.length ? 1900 : 3200);
}
const LEVELS = ['Seed', 'Sprout', 'Seedling', 'Sapling', 'Young tree', 'Tree', 'Grove', 'Forest'];
const levelName = l => LEVELS[Math.min(l, LEVELS.length) - 1];
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const box = document.createElement('div'); box.className = 'confetti';
  box.innerHTML = [...Array(36)].map((_, i) => `<i style="--x:${(Math.random() * 100).toFixed(1)}vw;--r:${(Math.random() * 720 - 360).toFixed(0)}deg;--d:${(Math.random() * 0.5).toFixed(2)}s;--c:var(--${['leaf', 'sun', 'study', 'petal'][i % 4]})"></i>`).join('');
  document.body.appendChild(box); setTimeout(() => box.remove(), 2600);
}
SP.onGame((kind, v) => {
  if (kind === 'level') { confetti(); toast(`Level ${v}: ${levelName(v)}`); }
  else if (kind === 'quest') toast(`Quest done: ${v.text}. +${v.xp} XP`);
  else if (kind === 'sweep') { confetti(); toast('All three quests done. +30 XP bonus'); }
  else if (kind === 'earnfreeze') toast(`${v}-day streak. You earned a streak freeze.`);
  else if (kind === 'freeze') toast(`A streak freeze covered ${niceDate(v)}. Your streak is safe.`);
});
SP.onToast(toast);

let queued = false;
function render() { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; draw(); }); }
SP.onChange(render);
function draw() {
  const onboarded = S.boot === 'ready' && S.settings.onboarded;
  document.body.dataset.screen = S.boot !== 'ready' ? 'gate' : onboarded ? 'app' : 'survey';
  patch(root.hdr, headerHTML());
  patch(root.tabs, onboarded ? tabsHTML() : '');
  if (S.boot === 'loading') patchView('loading', [['x', `<div class="gate"><div class="spinner"></div></div>`]]);
  else if (S.boot === 'config') patchView('config', [['x', configHTML()]]);
  else if (S.boot === 'signin') patchView('signin', [['x', signInHTML()]]);
  else if (!onboarded) drawSurvey();
  else {
    if (S.view === 'study' && (S.settings.mode === 'work' || !SP.drawStudy)) S.view = 'home';
    ({ home: drawHome, plan: drawPlan, study: SP.drawStudy, stats: drawStats, me: drawMe }[S.view] || drawHome)();
  }
  drawSheet();
}

// ---------- header, tabs ----------
function syncState() {
  const s = S.settings, y = S.sync;
  if (!SP.live(A.primary)) return { tone: 'bad', text: 'Reconnect' };
  if (y.state === 'running') return { tone: 'busy', text: y.todo ? `Updating ${y.done}/${y.todo}` : 'Checking…' };
  if (y.state === 'error') return { tone: 'bad', text: 'Needs a look' };
  if (!s.cals.write) return { tone: 'warn', text: 'Pick a calendar' };
  if (!s.autoSync) return { tone: 'idle', text: 'Paused' };
  if (y.state === 'ok') return { tone: 'ok', text: 'In sync' };
  return { tone: 'idle', text: 'Calendar' };
}
function avatarHTML(a) { return `<span class="avatar">${a?.picture ? `<img src="${esc(a.picture)}" alt="" referrerpolicy="no-referrer">` : esc(((a?.name || a?.email || '?')[0] || '?').toUpperCase())}</span>`; }
function headerHTML() {
  const ready = S.boot === 'ready', st = ready && S.settings.onboarded ? syncState() : null;
  return `<div class="brand">${IC.logo}<b>Sprout</b>${SP.DEMO ? '<span class="tag">Demo</span>' : ''}</div>
    <div class="hdr-right">
      ${ready ? SP.timerPill?.() || '' : ''}
      ${st ? `<button class="syncpill ${st.tone}" data-act="sheet" data-v="sync"><i></i>${esc(st.text)}</button>` : ''}
      ${ready ? `<button class="avatar-btn" data-act="tab" data-v="me" aria-label="Setup">${avatarHTML(A.primary)}</button>` : ''}
    </div>`;
}
const TABS = [['home', 'Today'], ['plan', 'Week'], ['study', 'Study'], ['stats', 'Stats'], ['me', 'Setup']];
const tabsHTML = () => TABS.filter(([id]) => id !== 'study' || S.settings.mode !== 'work').map(([id, label]) => `<button data-act="tab" data-v="${id}" ${S.view === id ? 'aria-current="page"' : ''}>${IC[id]}<span>${label}</span></button>`).join('');

// ---------- sign-in ----------
function gateWrap(inner) { return `<div class="gate">${plantSVG(3, false, 0)}${inner}</div>`; }
function configHTML() {
  return gateWrap(`<h1>Almost ready</h1>
    <p class="muted">Sprout needs its own Google sign-in ID before anyone can log in. It takes about ten minutes and is free. The steps are in <code>README.md</code>.</p>
    <div class="card left stack">
      <span class="label">When Google asks for a redirect address, use exactly</span>
      <code class="copyline" id="redirect">${esc(SP.REDIRECT)}</code>
      <button class="btn" data-act="copy" data-v="${esc(SP.REDIRECT)}">Copy address</button>
      <p class="small muted">Then paste the client ID into <code>config.js</code> and reload.</p>
    </div>
    <a class="btn ghost" href="?demo">Look around with sample data first</a>`);
}
function signInHTML() {
  return gateWrap(`<h1>Make time for what matters</h1>
    <p class="muted">Sprout reads your Google Calendar, finds your free time, and fills it with your goals and study blocks.</p>
    <button class="google" data-act="signin">${IC.google}<span>${SP.DEMO ? 'Start the demo' : 'Continue with Google'}</span></button>
    ${S.authMsg ? `<p class="note bad">${esc(S.authMsg)}</p>` : ''}
    <ul class="points">
      <li>Your plan is saved privately in your own Google Drive, so it follows you to every device.</li>
      <li>Sprout only ever changes events it created itself.</li>
    </ul>
    ${SP.DEMO ? '<p class="small muted">Demo mode uses made-up calendars. Nothing leaves this browser.</p>' : '<a class="btn ghost" href="?demo">Try it with sample data</a>'}`);
}

// ---------- plant ----------
const STAGES = [[0, 'Seed'], [1, 'Sprout'], [3, 'Seedling'], [7, 'Sapling'], [14, 'Budding'], [30, 'In bloom'], [60, 'Flourishing']];
const stageOf = good => { let i = 0; STAGES.forEach(([n], k) => { if (good >= n) i = k; }); return i; };
function plantSVG(stage, wilt, flowers) {
  const h = [0, 26, 48, 72, 96, 116, 136][stage], baseY = 170, lean = wilt ? 14 : 0, topX = 100 + lean, topY = baseY - h;
  let g = '';
  if (stage === 0) g = `<ellipse class="seed" cx="100" cy="164" rx="9" ry="6"/><path class="stem" d="M100 160 q2 -6 6 -8" style="stroke-width:3"/>`;
  else {
    g += `<path class="stem" d="M100 ${baseY} Q${100 - 6 + lean / 2} ${baseY - h / 2} ${topX} ${topY}"/>`;
    const n = Math.min(stage * 2, 11);
    for (let i = 0; i < n; i++) {
      const f = (i + 1) / (n + 1), y = baseY - h * f, x = 100 + lean * f * f - 12 * (1 - f) * f, side = i % 2 ? 1 : -1, size = 10 + stage * 1.8 - f * 3;
      g += `<ellipse class="${i % 3 ? 'leaf' : 'leaf2'}" cx="${(x + side * size * 0.8).toFixed(1)}" cy="${y.toFixed(1)}" rx="${size.toFixed(1)}" ry="${(size * 0.42).toFixed(1)}" transform="rotate(${side * (wilt ? 90 : 35)} ${(x + side * size * 0.8).toFixed(1)} ${y.toFixed(1)})"/>`;
    }
    g += `<ellipse class="leaf" cx="${topX}" cy="${topY - 6}" rx="6" ry="11" transform="rotate(${lean} ${topX} ${topY})"/>`;
    const fl = stage >= 4 && !wilt ? Math.max(1, Math.min(5, flowers)) : 0;
    for (let i = 0; i < fl; i++) {
      const f = 1 - i * 0.17, y = baseY - h * f - (i === 0 ? 12 : 0), x = i === 0 ? topX : 100 + (i % 2 ? 22 : -22) + lean * f;
      for (let p = 0; p < 5; p++) { const a = p * 72 * Math.PI / 180; g += `<circle class="petal" cx="${(x + Math.cos(a) * 6).toFixed(1)}" cy="${(y + Math.sin(a) * 6).toFixed(1)}" r="5"/>`; }
      g += `<circle class="center" cx="${x}" cy="${y}" r="3.500"/>`;
    }
  }
  return `<svg class="plant${wilt ? ' wilt' : ''}" viewBox="30 20 140 200" role="img" aria-label="${STAGES[stage][1]} plant${wilt ? ', wilting' : ''}">
    <g class="sway">${g}</g><ellipse class="soil" cx="100" cy="172" rx="44" ry="7"/>
    <path class="pot" d="M58 176 L142 176 L132 214 L68 214 Z"/><rect class="rim" x="52" y="168" width="96" height="12" rx="4"/></svg>`;
}

// ---------- shared pieces ----------
const chip = (label, on, attrs, cls = '') => `<button type="button" class="chip ${cls}" aria-pressed="${!!on}" ${attrs}>${label}</button>`;
const opt = (title, sub, on, attrs) => `<button type="button" class="opt" aria-pressed="${!!on}" ${attrs}><span class="radio"></span><span class="opt-t"><b>${title}</b>${sub ? `<small>${sub}</small>` : ''}</span></button>`;
const group = (label, inner, hint) => `<div class="group"><span class="label">${label}</span>${inner}${hint ? `<p class="hint">${hint}</p>` : ''}</div>`;
const dayToggles = (days, act) => `<div class="daypick">${WD.map((w, i) => `<button type="button" data-act="${act}" data-v="${i}" aria-pressed="${days.includes(i)}">${w[0]}<small>${w.slice(1)}</small></button>`).join('')}</div>`;
function taskRow(i, dayK, log) {
  const done = !!log?.done?.[i.key], can = dayK <= todayK();
  return `<div class="taskwrap"><button class="task ${i.kind}${done ? ' done' : ''}${S.ui.pop === i.key ? ' pop' : ''}" ${can ? `data-act="done" data-day="${dayK}" data-key="${esc(i.key)}"` : 'disabled'} aria-pressed="${done}">
    <span class="tick">${IC.check}</span>
    <span class="t-main"><b>${esc(i.title)}</b><small>${fmt(i.s)} – ${fmt(i.e)} · ${durTxt(i.len)}${i.moved ? ' · moved' : ''}</small></span>
    ${i.icon ? `<span class="t-icon">${i.icon}</span>` : ''}</button>
    ${dayK >= todayK() && !done ? `<button class="iconbtn mv" data-act="moveopen" data-day="${dayK}" data-key="${esc(i.key)}" aria-label="Move ${esc(i.title)} to another time">${MOVEIC}</button>` : ''}</div>`;
}
function dayListHTML(day, emptyText) {
  const s = S.settings, dS = toMin(s.day.start) ?? 420, dE = toMin(s.day.end) ?? 1380, log = S.log.days[day.k];
  const rows = [...day.items.map(i => ({ s: i.s, html: taskRow(i, day.k, log) })),
    ...day.busy.filter(b => b.e > dS && b.s < dE).map(b => ({ s: b.s, html: `<div class="busy ${b.kind}"><span>${fmt(b.s)} – ${fmt(b.e)}</span><b>${esc(b.title)}</b></div>` }))].sort((a, b) => a.s - b.s);
  return `${rows.length ? `<div class="daylist">${rows.map(r => r.html).join('')}</div>` : `<p class="empty">${emptyText}</p>`}
    ${day.unplaced.length ? `<p class="note warn">Couldn’t fit ${day.unplaced.map(u => `<b>${esc(u.title)}</b> (${esc(u.why)})`).join(', ')}.</p>` : ''}`;
}

// ---------- Today ----------
function alertsHTML() {
  const out = [];
  if (!SP.live(A.primary)) out.push(`<div class="note bad row"><span>Your Google sign-in ran out, so your calendar is not updating.</span><button class="btn small" data-act="reconnect" data-v="${A.primary.sub}">Reconnect</button></div>`);
  else {
    if (S.sync.state === 'error') out.push(`<div class="note bad row"><span>${esc(S.sync.msg)}</span><button class="btn small" data-act="sheet" data-v="${['no_write', 'readonly', 'gone'].includes(S.sync.code) ? 'cals' : 'sync'}">Fix</button></div>`);
    const bad = SP.calProblems(), auth = [...new Set(bad.filter(p => p.err === 'auth').map(p => p.sub))], other = bad.filter(p => p.err !== 'auth');
    for (const sub of auth) out.push(`<div class="note warn row"><span>${esc(SP.acctBy(sub)?.email)} needs reconnecting. Until then Sprout uses its last known schedule.</span><button class="btn small" data-act="reconnect" data-v="${sub}">Reconnect</button></div>`);
    if (other.length) out.push(`<div class="note warn row"><span>Could not read ${other.map(p => `<b>${esc(SP.calName(p.key))}</b>`).join(', ')}. Your plan ignores ${other.length > 1 ? 'them' : 'it'} for now.</span><button class="btn small" data-act="sheet" data-v="cals">Review</button></div>`);
  }
  return out.join('');
}
function drawHome() {
  const st = SP.computeStats(), stage = stageOf(st.goodDays), next = STAGES[stage + 1], t = todayK();
  const day = SP.planFor(thisWeek()).find(d => d.k === t), items = day.items, log = S.log.days[t];
  const doneN = items.filter(i => log?.done?.[i.key]).length;
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const hello = nowM < 720 ? 'Good morning' : nowM < 1050 ? 'Good afternoon' : 'Good evening', first = (A.primary?.name || '').split(' ')[0];
  const upNext = items.find(i => i.e > nowM && !log?.done?.[i.key]);
  const term = S.settings.mode === 'both' ? `<span class="pill ${day.term}">${SP.termLabel(day.term)} term</span>` : '';
  const G = S.game, lvl = SP.levelOf(G.xp), quests = SP.questList(), qDone = quests.filter(q => q.done).length;
  // Four weeks of days: a flower for a full day, a sprout for a partly done one.
  const g0 = addDays(thisWeek(), -21), cells = [...Array(28)].map((_, i) => { const k = dk(addDays(g0, i)), v = S.log.days[k], n = v?.plan?.length || 0, d = n ? v.plan.filter(p => v.done?.[p.k]).length : 0;
    const kind = k > t ? 'future' : G.frozen[k] ? 'frozen' : n && d === n ? 'full' : d ? 'part' : 'none';
    return `<i class="${kind}${k === t ? ' today' : ''}" title="${niceDate(k)}${n ? `: ${d} of ${n}` : ''}">${{ full: '🌸', part: '🌱', frozen: '❄️' }[kind] || ''}</i>`; }).join('');
  patchView('home', [
    ['alerts', alertsHTML(), 'stack'],
    ['hero', `<div class="hero card">
        <div class="hero-plant" style="--t:${(performance.now() / 1000 % 6).toFixed(2)}">${plantSVG(stage, st.wilting, Math.floor(st.streak / 3))}</div>
        <div class="hero-main">
          <span class="label">${STAGES[stage][1]}${st.wilting ? ' · needs water' : ''}</span>
          <h1>${hello}${first ? `, ${esc(first)}` : ''}</h1>
          <div class="hero-stats">
            <div><b class="num sun">${IC.flame}${st.streak}</b><small>day streak${G.freezes ? ` · ${G.freezes} freeze${G.freezes > 1 ? 's' : ''}` : ''}</small></div>
            <div><b class="num">${doneN}<i>/${items.length}</i></b><small>done today</small></div>
          </div>
          <div class="bar" aria-label="Today's progress"><i style="width:${items.length ? doneN / items.length * 100 : 0}%"></i></div>
          <div class="xprow"><b>Level ${lvl} · ${levelName(lvl)}</b><span class="bar"><i style="width:${(G.xp - SP.levelBase(lvl)) / (SP.levelBase(lvl + 1) - SP.levelBase(lvl)) * 100}%"></i></span><small>${SP.levelBase(lvl + 1) - G.xp} XP to go</small></div>
          <p class="small muted">${st.wilting ? 'Nothing got checked off yesterday, so your plant is thirsty. One block today perks it up.' : next ? `${next[0] - st.goodDays} more full day${next[0] - st.goodDays === 1 ? '' : 's'} to grow into a ${next[1].toLowerCase()}.` : 'Fully grown. Keep the streak alive.'}</p>
        </div></div>`],
    ['quests', quests.length ? `<div class="card quests"><div class="sec-head"><h3>Today’s quests</h3><span class="small muted">${qDone} of ${quests.length}${qDone === quests.length ? ' · all done' : ' · finish all for +30 XP'}</span></div>
        ${quests.map(q => `<div class="quest${q.done ? ' done' : ''}"><span class="q-tick">${q.done ? IC.check : ''}</span><b>${q.text}</b><small>${q.done ? 'Done' : q.goal > 1 ? `${q.cur}/${q.goal}` : ''}</small><em>+${q.xp}</em></div>`).join('')}</div>` : ''],
    ['today', `<div class="sec-head"><h2>Today</h2><span class="muted small">${new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</span>${term}</div>
      ${upNext ? `<p class="upnext">Up next: <b>${esc(upNext.title)}</b> at ${fmt(upNext.s)}</p>` : ''}
      ${dayListHTML(day, S.goals.list.length || S.settings.classes.length ? 'Nothing planned today. Enjoy the free time.' : 'Add a goal in Setup and Sprout will fit it into your free time.')}`],
    ['garden', `<div class="card"><div class="sec-head"><h3>Your garden</h3><span class="small muted">last 4 weeks</span></div>
        <div class="garden"><div class="g-head">${WD.map(w => `<span>${w[0]}</span>`).join('')}</div>${cells}</div>
        <p class="small muted">Doing even one thing keeps your streak. A fully finished day grows a flower.${G.freezes ? ` You have ${G.freezes} streak freeze${G.freezes > 1 ? 's' : ''} in reserve.` : ' A 7-day streak earns a freeze, which covers a day you could not get to anything.'}</p></div>`],
    ['tiles', `<div class="tiles">
        <div class="tile"><span class="label">Best streak</span><b class="num">${st.longest}</b></div>
        <div class="tile"><span class="label">Last 30 days</span><b class="num">${pct(st.rate)}</b></div>
        <div class="tile"><span class="label">Hours put in</span><b class="num">${(st.minutes / 60).toFixed(1)}</b></div>
      </div>`],
  ]);
}

// ---------- Week ----------
function drawPlan() {
  const s = S.settings, ws = S.weekStart, plan = SP.planFor(ws), t = todayK();
  const offset = Math.round((ws - thisWeek()) / (7 * 864e5));
  const inCal = s.autoSync && s.cals.write && offset >= 0 && offset < SP.FILL_WEEKS && S.sync.state === 'ok';
  const sum = kind => plan.reduce((n, d) => n + d.items.filter(i => i.kind === kind).reduce((a, i) => a + i.len, 0), 0);
  const sel = plan.find(d => d.k === S.selDay) || plan[0];
  const nav = `<div class="weeknav">
      <button class="iconbtn" data-act="wk" data-v="-1" aria-label="Previous week">${IC.back}</button>
      <div><h2>${ws.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${addDays(ws, 6).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</h2>
        <span class="small muted">${offset === 0 ? 'This week' : offset === 1 ? 'Next week' : offset === -1 ? 'Last week' : offset > 0 ? `In ${offset} weeks` : `${-offset} weeks ago`} · ${inCal ? 'in your Google Calendar' : offset >= SP.FILL_WEEKS ? `preview (Sprout adds ${SP.FILL_WEEKS} weeks ahead)` : 'preview'}</span></div>
      <button class="iconbtn" data-act="wk" data-v="1" aria-label="Next week">${IC.chev}</button>
    </div>
    <div class="legend">${wide.matches ? '<span>Drag a block to move it</span>' : ''}<span><i class="goal"></i>Goals ${hrs(sum('goal'))}</span>${s.mode !== 'work' ? `<span><i class="study"></i>Study ${hrs(sum('study'))}</span>` : ''}${offset !== 0 ? `<button class="link" data-act="wk" data-v="0">Back to this week</button>` : ''}</div>`;
  let body;
  if (wide.matches) {
    const dS = toMin(s.day.start) ?? 420, dE = toMin(s.day.end) ?? 1380, hours = [];
    for (let m = Math.ceil(dS / 60) * 60; m < dE; m += 60) hours.push(m);
    const top = m => (Math.max(m, dS) - dS) * PX, hgt = (a, b) => Math.max(16, (Math.min(b, dE) - Math.max(a, dS)) * PX - 2);
    body = `<div class="wk card" style="--h:${(dE - dS) * PX}px;--hour:${60 * PX}px">
      <div><div class="wk-head"></div><div class="wk-times">${hours.map(m => `<span style="top:${top(m)}px">${fmt(m)}</span>`).join('')}</div></div>
      ${plan.map(day => { const log = S.log.days[day.k]; return `<div class="wk-col${day.k === t ? ' today' : ''}">
        <div class="wk-head"><b>${WD[day.wd]} ${day.d.getDate()}</b>${s.mode === 'both' ? `<span class="pill ${day.term}">${SP.termLabel(day.term)}</span>` : ''}</div>
        <div class="wk-body" data-col="${day.k}" style="background-position:0 ${((60 - dS % 60) % 60) * PX}px">
          ${day.busy.filter(b => b.e > dS && b.s < dE).map(b => `<div class="blk ${b.kind}" style="top:${top(b.s)}px;height:${hgt(b.s, b.e)}px" title="${esc(b.title)}"><b>${esc(b.title)}</b><span>${fmt(b.s)}</span></div>`).join('')}
          ${day.items.map(i => `<button class="blk ${i.kind}${log?.done?.[i.key] ? ' done' : ''}" style="top:${top(i.s)}px;height:${hgt(i.s, i.e)}px" ${day.k <= t ? `data-act="done" data-day="${day.k}" data-key="${esc(i.key)}"` : ''} ${day.k >= t && !log?.done?.[i.key] ? `data-drag="${esc(i.key)}" data-dk="${day.k}" data-s="${i.s}" data-len="${i.len}"` : ''} title="${esc(i.title)} ${fmt(i.s)}–${fmt(i.e)}${day.k >= t ? '. Drag to move' : ''}"><b>${esc(i.title)}</b><span>${fmt(i.s)}–${fmt(i.e)}</span></button>`).join('')}
        </div></div>`; }).join('')}</div>`;
  } else {
    body = `<div class="daystrip">${plan.map(day => { const log = S.log.days[day.k], n = day.items.length, d = day.items.filter(i => log?.done?.[i.key]).length;
        return `<button data-act="selday" data-v="${day.k}" aria-pressed="${day.k === sel.k}" class="${day.k === t ? 'today' : ''}"><small>${WD[day.wd]}</small><b>${day.d.getDate()}</b><i class="${n && d === n ? 'full' : n ? 'some' : ''}"></i></button>`; }).join('')}</div>
      <div class="sec-head"><h3>${sel.d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>${s.mode === 'both' ? `<span class="pill ${sel.term}">${SP.termLabel(sel.term)} term</span>` : ''}</div>
      ${dayListHTML(sel, 'Nothing planned this day.')}`;
  }
  const unplaced = wide.matches ? plan.flatMap(d => d.unplaced.map(u => `${WD[d.wd]}: ${esc(u.title)}, ${esc(u.why)}`)) : [];
  patchView('plan', [['nav', nav], ['body', body], ['more', unplaced.length ? `<p class="note warn"><b>Didn’t fit this week</b><br>${unplaced.join('<br>')}</p>` : '']]);
}

// ---------- Stats ----------
function hbars(obj, cls) {
  const arr = Object.values(obj).filter(a => a.min > 0).sort((a, b) => b.min - a.min), max = Math.max(1, ...arr.map(a => a.min));
  return arr.length ? arr.map(a => `<div class="hbar ${cls}"><span>${esc(a.name)}</span><i><b style="width:${a.min / max * 100}%"></b></i><em>${(a.min / 60).toFixed(1)} h</em></div>`).join('') : '<p class="empty">Check off blocks to see your time here.</p>';
}
function drawStats() {
  const st = SP.computeStats(), s = S.settings, bars = st.last14, W = 308, H = 110, bw = W / 14;
  const wd = st.byWd.map((w, i) => ({ n: WD[i], r: w.p ? w.d / w.p : null })), best = wd.filter(x => x.r != null).sort((a, b) => b.r - a.r)[0];
  const terms = ['school', 'work', 'break'].filter(k => st.byTerm[k]);
  const badges = [['First full day', st.goodDays >= 1], ['3-day streak', st.longest >= 3], ['7-day streak', st.longest >= 7], ['30-day streak', st.longest >= 30], ['10 hours put in', st.minutes >= 600], ['50 check-offs', st.checks >= 50], ['200 check-offs', st.checks >= 200], ['Plant in bloom', st.goodDays >= 30], ['Level 5', SP.levelOf(S.game.xp) >= 5], ['Level 8', SP.levelOf(S.game.xp) >= 8]];
  patchView('stats', [
    ['tiles', `<div class="sec-head"><h1>Your stats</h1></div><div class="tiles five">
      <div class="tile"><span class="label">Streak</span><b class="num sun">${IC.flame}${st.streak}</b></div>
      <div class="tile"><span class="label">Best streak</span><b class="num">${st.longest}</b></div>
      <div class="tile"><span class="label">Done · 30 days</span><b class="num">${pct(st.rate)}</b></div>
      <div class="tile"><span class="label">Hours · 30 days</span><b class="num">${(st.minutes / 60).toFixed(1)}</b></div>
      <div class="tile"><span class="label">Full days</span><b class="num">${st.goodDays}</b></div></div>`],
    ['grid', `<div class="card"><div class="sec-head"><h3>Last 14 days</h3><span class="legend"><span><i class="goal"></i>All done</span><span><i class="part"></i>Partly</span></span></div>
        <svg class="chart" viewBox="0 0 ${W} ${H + 18}" role="img" aria-label="How much you finished each day">
          ${[0, 0.5, 1].map(f => `<line x1="0" x2="${W}" y1="${H - f * (H - 4) + 0.5}" y2="${H - f * (H - 4) + 0.5}"/>`).join('')}
          ${bars.map((b, i) => { const f = b.p ? b.d / b.p : 0, h = b.p ? Math.max(4, f * (H - 4)) : 2; return `<rect class="${!b.p ? 'none' : f === 1 ? 'full' : 'part'}" x="${(i * bw + 4).toFixed(1)}" y="${H - h}" width="${(bw - 8).toFixed(1)}" height="${h}" rx="3"><title>${niceDate(b.k)}: ${b.d} of ${b.p}</title></rect>`; }).join('')}
          ${bars.map((b, i) => i % 2 ? `<text x="${(i * bw + bw / 2).toFixed(1)}" y="${H + 14}" text-anchor="middle">${parseDk(b.k).getDate()}</text>` : '').join('')}</svg></div>
      <div class="card"><h3>Time on goals · 30 days</h3>${hbars(st.byGoal, '')}</div>
      ${s.mode !== 'work' ? `<div class="card"><h3>Study by class · 30 days</h3>${hbars(st.byClass, 'study')}</div>` : ''}
      <div class="card"><h3>By day of the week</h3>${wd.map(x => `<div class="hbar"><span>${x.n}</span><i><b style="width:${(x.r || 0) * 100}%"></b></i><em>${pct(x.r)}</em></div>`).join('')}${best ? `<p class="small muted">You follow through best on ${best.n}s.</p>` : ''}</div>
      ${s.mode === 'both' ? `<div class="card"><h3>School vs work terms</h3>${terms.map(k => `<div class="hbar"><span>${SP.termLabel(k)}</span><i><b style="width:${st.byTerm[k].d / st.byTerm[k].p * 100}%"></b></i><em>${pct(st.byTerm[k].d / st.byTerm[k].p)}</em></div>`).join('') || '<p class="empty">Shows how you keep up in each kind of term.</p>'}</div>` : ''}
      <div class="card"><h3>Milestones</h3><div class="badges">${badges.map(([n, got]) => `<span class="${got ? 'got' : ''}">${IC.star}${n}</span>`).join('')}</div></div>`, 'cards'],
  ]);
}

// ---------- Setup ----------
const rowBtn = (title, value, sheet) => `<button class="listrow" data-act="sheet" data-v="${sheet}"><b>${title}</b><span>${value}</span>${IC.chev}</button>`;
function drawMe() {
  const s = S.settings, st = syncState();
  const terms = s.terms.filter(t => t.start && t.end).length;
  patchView('me', [
    ['who', `<div class="who card">${avatarHTML(A.primary)}<div><b>${esc(A.primary.name || 'Signed in')}</b><small>${esc(A.primary.email)}</small></div><button class="btn small" data-act="signout">Sign out</button></div>`],
    ['plan', `<span class="label">Your plan</span><div class="list card">
      ${rowBtn('Goals', S.goals.list.length ? S.goals.list.map(x => esc(x.name)).join(', ') : 'None yet', 'goals')}
      ${s.mode !== 'work' ? rowBtn('Classes', s.classes.length ? s.classes.map(c => esc(c.name)).join(', ') : 'None yet', 'classes') : ''}</div>`],
    ['sched', `<span class="label">Your schedule</span><div class="list card">
      ${rowBtn('I am', { student: 'A student', work: 'Working', both: 'Both, in terms' }[s.mode], 'mode')}
      ${s.mode === 'both' ? rowBtn('Terms', terms ? `${terms} set` : 'Not set', 'terms') : ''}
      ${s.mode !== 'student' ? rowBtn('Work hours', s.work.source === 'calendar' ? 'From my calendar' : `${fmt(toMin(s.work.start))} – ${fmt(toMin(s.work.end))}`, 'work') : ''}
      ${rowBtn('My day', `${fmt(toMin(s.day.start))} – ${fmt(toMin(s.day.end))}`, 'day')}</div>`],
    ['cal', `<span class="label">Google Calendar</span><div class="list card">
      ${rowBtn('Calendars and accounts', s.cals.write ? `Filling ${esc(SP.calName(s.cals.write))}` : 'Choose a calendar', 'cals')}
      ${rowBtn('Calendar updates', esc(st.text), 'sync')}</div>`],
    ['ai', s.mode !== 'work' && SP.coachRow ? `<span class="label">Study coach</span><div class="list card">${SP.coachRow()}</div>` : ''],
    ['more', `<div class="list card"><button class="listrow" data-act="retake"><b>Retake the survey</b><span></span>${IC.chev}</button></div>
      <p class="small muted center">Your plan is saved on this device and privately in your Google Drive${S.dataState === 'error' ? ' (Drive backup is waiting for a connection)' : ''}.</p>`],
  ]);
}

// ---------- survey + editor bodies (the same pieces serve the survey and the Setup sheets) ----------
function modeBody() {
  const m = S.settings.mode;
  return `<div class="opts">${opt('Student', 'Classes, study blocks and goals', m === 'student', 'data-act="mode" data-v="student"')}
    ${opt('Working', 'Goals fitted around your work hours', m === 'work', 'data-act="mode" data-v="work"')}
    ${opt('Both, in terms', 'School terms and work terms that alternate, like co-op', m === 'both', 'data-act="mode" data-v="both"')}</div>
    ${S.settings.onboarded ? '' : `<p class="hint center">Signed in as ${esc(A.primary.email)}. <button class="link" data-act="signout">Use a different account</button></p>`}`;
}
function termsBody() {
  const terms = S.settings.terms;
  if (!terms.length) return `${group('Right now I am', `<div class="opts">${opt('In a school term', '', false, 'data-act="termseed" data-v="school"')}${opt('On a work term', '', false, 'data-act="termseed" data-v="work"')}</div>`, 'Sprout fills in the next year of four-month terms. You can change any of them.')}`;
  return `<div class="stack">${terms.map(t => `<div class="card term">
      <div class="sec-head"><b>${esc(t.label || 'Term')}</b><span class="small muted">${t.start && t.end ? `${niceDate(t.start)} – ${niceDate(t.end)}` : 'No dates yet'}</span></div>
      <div class="seg">${[['school', 'School'], ['work', 'Work'], ['break', 'Off']].map(([v, l]) => `<button type="button" aria-pressed="${t.type === v}" data-act="termtype" data-id="${t.id}" data-v="${v}">${l}</button>`).join('')}</div>
      ${S.ui.termEdit === t.id ? `<div class="two"><label class="field"><span>Starts</span><input type="date" id="ts-${t.id}" data-term="${t.id}" data-k="start" value="${esc(t.start)}"></label><label class="field"><span>Ends</span><input type="date" id="te-${t.id}" data-term="${t.id}" data-k="end" value="${esc(t.end)}"></label></div><button class="link danger" data-act="termdel" data-v="${t.id}">Remove this term</button>`
        : `<button class="link" data-act="termedit" data-v="${t.id}">Change exact dates</button>`}</div>`).join('')}
    <button class="btn" data-act="termadd">${IC.plus}Add the next term</button></div>`;
}
function workBody() {
  const w = S.settings.work, std = SP.daysMode(w.days) === 'weekdays';
  const preset = !S.ui.workCustom && w.source === 'manual' && std ? WORK_PRESETS.findIndex(p => p[0] === w.start && p[1] === w.end) : -1;
  const custom = w.source === 'manual' && preset < 0;
  return `<div class="opts">${WORK_PRESETS.map((p, i) => opt(`${fmt(toMin(p[0]))} – ${fmt(toMin(p[1]))}`, 'Monday to Friday', preset === i, `data-act="workpreset" data-v="${i}"`)).join('')}
    ${opt('It’s already in my calendar', 'Shifts or meetings that change week to week', w.source === 'calendar', 'data-act="worksrc" data-v="calendar"')}
    ${opt('Something else', 'Pick your own days and hours', custom, 'data-act="worksrc" data-v="custom"')}</div>
    ${custom ? `<div class="card stack">${dayToggles(w.days, 'workday')}<div class="two"><label class="field"><span>Start</span><input type="time" id="w-start" data-in="s.work.start" value="${esc(w.start)}"></label><label class="field"><span>End</span><input type="time" id="w-end" data-in="s.work.end" value="${esc(w.end)}"></label></div></div>` : ''}`;
}
const classBase = title => title.replace(/\s*[-–:(]?\s*\b(lecture|lec|lab|tutorial|tut|seminar|sem|discussion|class)\b.*$/i, '').trim() || title;
function classSuggestions() {
  const have = S.settings.classes.map(c => (c.match || '').toLowerCase()).filter(Boolean), counts = {};
  for (const e of SP.eventsFor(thisWeek())) if (e.recurring && !e.mine) { const n = classBase(e.title); counts[n] = (counts[n] || 0) + 1; }
  return Object.keys(counts).filter(n => !have.some(h => n.toLowerCase().includes(h))).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
}
function classesBody() {
  const s = S.settings, sugg = classSuggestions(), load = s.study.perLevel;
  return `${s.mode === 'both' && SP.termType(todayK()) !== 'school' ? '<p class="note">You are not in a school term right now. Add classes any time; study blocks start when your school term does.</p>' : ''}
    ${s.classes.length ? `<div class="stack">${s.classes.map(c => `<div class="card cls">
        <input id="cn-${c.id}" class="bare" data-cls="${c.id}" value="${esc(c.name)}" aria-label="Class name">
        <button class="iconbtn" data-act="clsdel" data-v="${c.id}" aria-label="Remove ${esc(c.name)}">${IC.close}</button>
        <div class="pips"><small>Easy</small>${[1, 2, 3, 4, 5].map(n => `<button type="button" class="${n <= c.difficulty ? 'on' : ''}" data-act="clsdiff" data-id="${c.id}" data-v="${n}" aria-label="Difficulty ${n} of 5">${n}</button>`).join('')}<small>Hard</small></div>
        <small class="muted">${durTxt(Math.round(c.difficulty * load * 60))} of study a week</small></div>`).join('')}</div>` : ''}
    ${sugg.length ? group('From your calendar', `<div class="chips">${sugg.map(n => chip(`+ ${esc(n)}`, false, `data-act="clsadd" data-v="${esc(n)}"`)).join('')}</div>`) : ''}
    <form class="addline" data-form="cls"><input id="new-cls" data-in="u.newClass" value="${esc(S.ui.newClass)}" placeholder="Add a class, e.g. MATH 135" enterkeyhint="done"><button class="btn" type="submit">Add</button></form>
    ${group('How much studying?', `<div class="chips">${[[1, 'Light'], [1.5, 'Balanced'], [2, 'Heavy']].map(([v, l]) => chip(l, load === v, `data-act="set" data-p="s.study.perLevel" data-v="${v}" data-n="1"`)).join('')}</div>`, 'A harder class gets more hours. Balanced gives a mid-difficulty class about 4.5 hours a week.')}`;
}
function goalRow(x) { const y = SP.goalSummary(x); return `<button class="listrow goal" data-act="goaledit" data-v="${x.id}"><i class="g-icon">${x.icon || '🎯'}</i><b>${esc(x.name)}</b><span>${[y.len, y.when, y.days, y.until].filter(Boolean).map(esc).join(' · ')}</span>${IC.chev}</button>`; }
function goalsBody() {
  const list = S.goals.list, has = n => list.find(x => x.name.toLowerCase() === n.toLowerCase());
  return `${list.length ? `<div class="list card">${list.map(goalRow).join('')}</div><p class="hint">Tap a goal to change how long, when, or which days.</p>` : ''}
    ${group(list.length ? 'Add more' : 'Tap any that fit', `<div class="chips big">${CATALOG.map((c, i) => { const g = has(c.name); return chip(`<i>${c.icon}</i>${esc(c.name)}`, !!g, g ? `data-act="goaledit" data-v="${g.id}"` : `data-act="goalquick" data-v="${i}"`); }).join('')}${chip(`<i>＋</i>Something else`, false, 'data-act="goalnew"')}</div>`)}`;
}
function dayBody() {
  const d = S.settings.day, wake = ['06:00', '07:00', '08:00', '09:00'], end = ['21:00', '22:00', '23:00', '23:59'];
  const wc = S.ui.wakeCustom || !wake.includes(d.start), ec = S.ui.endCustom || !end.includes(d.end);
  return `${group('Start planning from', `<div class="chips">${wake.map(v => chip(fmt(toMin(v)), !wc && d.start === v, `data-act="daypick" data-k="start" data-v="${v}"`)).join('')}${chip('Other', wc, 'data-act="daycustom" data-v="wake"')}</div>
      ${wc ? `<input type="time" id="d-start" data-in="s.day.start" value="${esc(d.start)}" aria-label="Day starts">` : ''}`)}
    ${group('Nothing after', `<div class="chips">${end.map(v => chip(v === '23:59' ? 'Midnight' : fmt(toMin(v)), !ec && d.end === v, `data-act="daypick" data-k="end" data-v="${v}"`)).join('')}${chip('Other', ec, 'data-act="daycustom" data-v="end"')}</div>
      ${ec ? `<input type="time" id="d-end" data-in="s.day.end" value="${esc(d.end)}" aria-label="Day ends">` : ''}`)}
    ${group('Breathing room between things', `<div class="chips">${[[0, 'None'], [10, '10 min'], [15, '15 min'], [30, '30 min']].map(([v, l]) => chip(l, S.settings.buffer === v, `data-act="set" data-p="s.buffer" data-v="${v}" data-n="1"`)).join('')}</div>`)}`;
}
// Says why Google refused, so a setup problem is not mistaken for a bad connection.
const calWhy = e => e.code === 'offline' ? ' Check your connection.'
  : e.code === 'auth' ? ' Your sign-in expired. Sign in again.'
  : /has not been used|is disabled|accessNotConfigured/i.test(e.message || '') ? ' Google Calendar API is not turned on for this app’s Google Cloud project (README, step 1).'
  : e.message ? ` Google said: ${esc(e.message)}` : '';
function calsBody() {
  const c = S.settings.cals, me = A.primary, mine = S.cals[me.sub] || [], writable = mine.filter(SP.canWrite);
  const missing = S.settings.accounts.filter(x => !A.extra.some(y => y.sub === x.sub));
  const acctBlock = a => { const cals = S.cals[a.sub] || [], extra = a !== me;
    return `<div class="acct"><div class="sec-head"><b>${esc(a.email)}</b>${extra ? '<span class="tag">View only</span>' : ''}</div>
      ${!SP.live(a) ? `<div class="note warn row"><span>Needs reconnecting on this device.</span><button class="btn small" data-act="reconnect" data-v="${a.sub}">Reconnect</button></div>` : ''}
      <div class="list card">${cals.map(x => { const key = SP.calKey(a.sub, x.id); return `<button class="listrow sw" role="switch" aria-checked="${c.read.includes(key)}" data-act="calread" data-v="${esc(key)}"><b>${esc(x.name)}</b><span></span><i class="switch"></i></button>`; }).join('') || `<p class="empty">${S.calErr[a.sub] ? 'Could not load this account’s calendars.' + calWhy(S.calErr[a.sub]) : 'Loading calendars…'}</p>`}</div>
      ${extra ? `<button class="link danger" data-act="acctdel" data-v="${a.sub}">Disconnect this account</button>` : ''}</div>`; };
  return `${group('Add my plan to', writable.length ? `<div class="opts">${writable.map(x => { const key = SP.calKey(me.sub, x.id); return opt(esc(x.name), x.primary ? 'Your main calendar' : '', c.write === key, `data-act="calwrite" data-v="${esc(key)}"`); }).join('')}</div>` : `<p class="empty">${S.calErr[me.sub] ? 'Could not load your calendars.' + calWhy(S.calErr[me.sub]) : 'Loading your calendars…'}</p>`, 'This is the only calendar Sprout ever adds to or changes.')}
    ${group('Plan around events in', SP.accounts().map(acctBlock).join(''), 'Sprout treats events in these calendars as busy time.')}
    ${missing.map(x => `<div class="note row"><span>${esc(x.email)} is not connected on this device.</span><button class="btn small" data-act="addacct">Connect</button></div>`).join('')}
    <button class="btn" data-act="addacct">${IC.plus}Connect another Google account</button>
    <p class="hint">For example a work account. Sprout can only look at its calendar and can never change it.</p>
    ${S.authMsg ? `<p class="note bad">${esc(S.authMsg)}</p>` : ''}`;
}
function syncBody() {
  const s = S.settings, y = S.sync, st = syncState(), last = y.last;
  const calUrl = `https://calendar.google.com/calendar/r/week?authuser=${encodeURIComponent(A.primary.email)}`;
  return `<div class="syncbig ${st.tone}"><i></i><div><b>${esc(st.text)}</b>
      <small>${y.state === 'error' ? esc(y.msg) : y.state === 'running' ? 'Bringing your calendar in line with your plan.' : !s.cals.write ? 'Choose which calendar Sprout should fill.' : y.state === 'ok' ? `${y.found} Sprout block${y.found === 1 ? '' : 's'} on “${esc(SP.calName(s.cals.write))}” for the next ${SP.FILL_WEEKS} weeks. Checked ${ago(y.at)}.` : s.autoSync ? 'Waiting for the first update.' : 'Sprout is not adding anything to your calendar.'}</small></div></div>
    ${last ? `<p class="small muted">Last change ${ago(last.at)}: ${[last.added && `${last.added} added`, last.moved && `${last.moved} moved`, last.removed && `${last.removed} removed`].filter(Boolean).join(', ')}.</p>` : ''}
    <div class="stack">
      <button class="btn primary" data-act="syncnow" ${y.state === 'running' || !SP.live(A.primary) ? 'disabled' : ''}>Update now</button>
      ${SP.DEMO ? '' : `<a class="btn" href="${calUrl}" target="_blank" rel="noopener">Open Google Calendar</a>`}
    </div>
    <div class="list card"><button class="listrow sw" role="switch" aria-checked="${s.autoSync}" data-act="autosync"><b>Keep my calendar filled</b><span></span><i class="switch"></i></button></div>
    <p class="hint">While Sprout is open it re-checks every two minutes and after every change you make. It only moves or removes events it created.</p>
    ${S.ui.confirm === 'remove' ? `<div class="note bad stack"><span>Remove every upcoming event Sprout added? Your own events are not touched, and calendar filling pauses.</span><div class="row"><button class="btn danger" data-act="removeall">Remove them</button><button class="btn ghost" data-act="confirm" data-v="">Keep them</button></div></div>`
      : `<button class="link danger" data-act="confirm" data-v="remove">Remove Sprout’s events from my calendar</button>`}`;
}
const ago = t => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };

// ---------- goal editor ----------
const blankGoal = () => ({ name: '', icon: '', minutes: 30, slot: 'auto', after: '', before: '', days: [], start: todayK(), end: '', during: 'all' });
function toDraft(x) {
  const termEnd = SP.currentTerm()?.end;
  return { ...blankGoal(), ...x, days: [...(x.days || [])], slot: x.slot || (x.after || x.before ? 'custom' : 'auto'), minutes: SP.goalLen(x),
    durCustom: !DURS.includes(SP.goalLen(x)), durText: String(SP.goalLen(x)), daysMode: SP.daysMode(x.days), untilMode: !x.end ? 'ongoing' : x.end === termEnd ? 'term' : 'date', named: !!x.name };
}
function goalBody() {
  const d = S.draft, termEnd = SP.currentTerm()?.end;
  return `${d.named ? '' : `<label class="field"><span>What is it?</span><input id="g-name" data-in="d.name" value="${esc(d.name)}" placeholder="e.g. Practice piano" enterkeyhint="done"></label>`}
    ${group('How long', `<div class="chips">${DURS.map(m => chip(durTxt(m), !d.durCustom && d.minutes === m, `data-act="gdur" data-v="${m}"`)).join('')}${chip('Other', d.durCustom, 'data-act="gdur" data-v="custom"')}</div>
      ${d.durCustom ? `<input id="g-dur" data-in="d.durText" value="${esc(d.durText)}" inputmode="decimal" placeholder="Minutes, or like 1.5h" aria-label="How long">` : ''}`)}
    ${group('When', `<div class="chips">${chip('Best free time', d.slot === 'auto', 'data-act="gslot" data-v="auto"')}${Object.entries(SLOTS).map(([k, v]) => chip(v.label, d.slot === k, `data-act="gslot" data-v="${k}"`)).join('')}${chip('Exact times', d.slot === 'custom', 'data-act="gslot" data-v="custom"')}</div>
      ${d.slot === 'custom' ? `<div class="two"><label class="field"><span>Not before</span><input type="time" id="g-after" data-in="d.after" value="${esc(d.after)}"></label><label class="field"><span>Done by</span><input type="time" id="g-before" data-in="d.before" value="${esc(d.before)}"></label></div>` : ''}`,
      d.slot === 'custom' ? 'Sprout never places it outside these times. Leave one blank if it does not matter.' : d.slot === 'auto' ? '' : 'Sprout aims for this part of the day and uses other free time if it is full.')}
    ${group('Which days', `<div class="chips">${[['daily', 'Every day'], ['weekdays', 'Weekdays'], ['weekends', 'Weekends'], ['x3', 'Mon, Wed, Fri'], ['custom', 'Pick days']].map(([k, l]) => chip(l, d.daysMode === k, `data-act="gdays" data-v="${k}"`)).join('')}</div>${d.daysMode === 'custom' ? dayToggles(d.days, 'gday') : ''}`)}
    ${group('Until', `<div class="chips">${chip('Keep going', d.untilMode === 'ongoing', 'data-act="guntil" data-v="ongoing"')}${termEnd ? chip(`End of term (${niceDate(termEnd)})`, d.untilMode === 'term', 'data-act="guntil" data-v="term"') : ''}${chip('Pick a date', d.untilMode === 'date', 'data-act="guntil" data-v="date"')}</div>
      ${d.untilMode === 'date' ? `<input type="date" id="g-end" data-in="d.end" value="${esc(d.end)}" aria-label="End date">` : ''}`)}
    ${S.settings.mode === 'both' ? group('During', `<div class="chips">${[['all', 'All terms'], ['school', 'School terms'], ['work', 'Work terms']].map(([k, l]) => chip(l, d.during === k, `data-act="set" data-p="d.during" data-v="${k}"`)).join('')}</div>`) : ''}
    ${d.err ? `<p class="note bad">${esc(d.err)}</p>` : ''}`;
}
function commitGoal() {
  const d = S.draft, fail = m => { d.err = m; render(); return false; };
  const name = (d.name || '').trim();
  if (!name) return fail('Give your goal a name.');
  const minutes = d.durCustom ? SP.parseDur(d.durText) : d.minutes;
  if (!minutes || Number.isNaN(minutes) || minutes < 5 || minutes > 720) return fail('Enter how long in minutes (like 45) or hours (like 1.5h).');
  if (d.slot === 'custom' && d.after && d.before && toMin(d.after) >= toMin(d.before)) return fail('“Not before” has to be earlier than “Done by”.');
  if (d.slot === 'custom' && d.after && d.before && toMin(d.before) - toMin(d.after) < minutes) return fail(`${durTxt(minutes)} does not fit between those times.`);
  if (d.daysMode === 'custom' && !d.days.length) return fail('Pick at least one day.');
  if (d.untilMode === 'date' && !d.end) return fail('Pick the last day, or choose “Keep going”.');
  if (d.end && d.end < todayK()) return fail('That end date has already passed.');
  const x = { id: d.id || rid(), name, icon: d.icon || '', minutes, slot: d.slot, after: d.slot === 'custom' ? d.after : '', before: d.slot === 'custom' ? d.before : '',
    days: d.daysMode === 'custom' ? [...d.days].sort() : [...DAYSETS[d.daysMode]], start: d.start || todayK(), end: d.untilMode === 'ongoing' ? '' : d.end, during: d.during || 'all', at: d.at || Date.now() };
  const i = S.goals.list.findIndex(y => y.id === x.id);
  if (i >= 0) S.goals.list[i] = x; else S.goals.list.push(x);
  toast(i >= 0 ? 'Goal saved.' : `Added ${name}.`);
  return true;
}

// ---------- sheets ----------
const SHEETS = {
  goals: { title: 'Goals', body: goalsBody }, classes: { title: 'Classes', body: classesBody }, mode: { title: 'I am', body: modeBody },
  terms: { title: 'Terms', body: termsBody }, work: { title: 'Work hours', body: workBody }, day: { title: 'My day', body: dayBody },
  cals: { title: 'Calendars and accounts', body: calsBody }, sync: { title: 'Calendar updates', body: syncBody },
};
function drawSheet() {
  const sh = S.sheet, el = root.sheet;
  document.body.classList.toggle('sheet-open', !!sh);
  if (!sh) { if (el.__type) { el.__type = null; el.innerHTML = ''; } return; }
  const isGoal = sh.type === 'goal', def = SHEETS[sh.type];
  if (!isGoal && !def) { S.sheet = null; document.body.classList.remove('sheet-open'); return; }
  if (el.__type !== sh.type) {
    // Slide in only when a sheet first opens, not when stepping from one sheet to another.
    const anim = el.__type ? '' : ' in';
    el.innerHTML = `<div class="backdrop${anim}" data-act="closesheet"></div>
      <div class="sheet${anim}" role="dialog" aria-modal="true" aria-label="${isGoal ? 'Goal' : esc(sheetTitle(def))}"><div class="sheet-head"></div><div class="sheet-body"></div><div class="sheet-foot"></div></div>`;
    el.__type = sh.type;
  }
  const title = isGoal ? `${S.draft.icon ? S.draft.icon + ' ' : ''}${esc(S.draft.named ? S.draft.name : 'New goal')}` : esc(sheetTitle(def));
  patch($('.sheet-head', el), `<h2>${title}</h2><button class="iconbtn" data-act="closesheet" aria-label="Close">${IC.close}</button>`);
  patch($('.sheet-body', el), isGoal ? goalBody() : def.body());
  patch($('.sheet-foot', el), isGoal ? `${S.draft.id ? `<button class="btn danger" data-act="goaldel">Delete</button>` : ''}<button class="btn primary grow" data-act="goalsave">${S.draft.id ? 'Save' : 'Add goal'}</button>` : def.foot ? def.foot() : `<button class="btn primary grow" data-act="closesheet">Done</button>`);
}
const sheetTitle = def => typeof def.title === 'function' ? def.title() : def.title;
function openSheet(type, extra = {}) { S.sheet = { type, ...extra }; S.ui.confirm = null; if (type !== 'cals') S.authMsg = ''; render(); }
function closeSheet() {
  SP.onSheetClose?.(S.sheet);
  const back = S.sheet?.back; S.sheet = back ? { type: back } : null; S.draft = null; S.ui.confirm = null; S.ui.termEdit = null; render();
}

// ---------- moving a block ----------
const MOVEIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.500"/><path d="M12 7.500V12l3 2"/></svg>';
const whenTxt = (k, s) => `${parseDk(k).toLocaleDateString(undefined, { weekday: 'short' })} ${fmt(s)}`;
function openMove(item, fromDay, toDay, toS) {
  S.ui.move = { key: item.key, title: item.title, kind: item.kind, ref: item.ref, len: item.len, from: { day: fromDay, s: item.s }, day: toDay ?? fromDay, s: toS ?? item.s };
  openSheet('move');
}
SHEETS.move = { title: () => `Move ${S.ui.move.title}`, foot: () => `<button class="btn grow" data-act="closesheet">Cancel</button>`, body: () => {
  const m = S.ui.move, ws = monday(parseDk(m.from.day)), t = todayK(), changed = m.day !== m.from.day || m.s !== m.from.s;
  const goal = m.kind === 'goal' ? S.goals.list.find(x => x.id === m.ref) : null;
  const swaps = goal && m.day !== m.from.day && goal.days?.length && !goal.days.includes(SP.wdOf(parseDk(m.day)));
  const long = d => parseDk(d).toLocaleDateString(undefined, { weekday: 'long' });
  return `<p class="note">${changed ? `From <b>${whenTxt(m.from.day, m.from.s)}</b> to <b>${whenTxt(m.day, m.s)} – ${fmt(m.s + m.len)}</b>` : `Now at <b>${whenTxt(m.from.day, m.from.s)}</b>. Pick a new day or time.`}</p>
    ${group('Day', `<div class="chips">${[...Array(7)].map((_, i) => dk(addDays(ws, i))).filter(k => k >= t).map(k => chip(parseDk(k).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }), m.day === k, `data-act="moveday" data-v="${k}"`)).join('')}</div>`)}
    ${group('Start time', `<input type="time" id="mv-time" data-change="movetime" value="${SP.fromMin(m.s)}" step="900" aria-label="Start time">
      <div class="chips">${[[-60, '1 h earlier'], [-15, '15 min earlier'], [15, '15 min later'], [60, '1 h later']].map(([n, l]) => chip(l, false, `data-act="movenudge" data-v="${n}"`)).join('')}</div>`)}
    <div class="stack">
      <button class="btn primary" data-act="moveapply" data-v="one" ${changed ? '' : 'disabled'}>Just this one</button>
      <button class="btn" data-act="moveapply" data-v="all" ${changed ? '' : 'disabled'}>${m.kind === 'goal' ? `Every ${esc(m.title)} from now on` : `All ${esc(m.title.replace(/^Study: /, ''))} study blocks from now on`}</button>
    </div>
    <p class="hint">${m.kind !== 'goal' ? `“From now on” starts this class’s study blocks at ${fmt(m.s)} whenever that time is free.`
      : swaps ? `“From now on” moves its ${long(m.from.day)} sessions to ${long(m.day)}s at ${fmt(m.s)}.`
      : `“From now on” starts it at ${fmt(m.s)} on every day it runs, or as soon after as you are free.`} Your Google Calendar updates to match.</p>
    ${S.moves[m.key] ? `<button class="link" data-act="moveundo">Put this one back where Sprout planned it</button>` : ''}`;
} };
const MOVE_ACTS = {
  moveopen: t => { const k = t.dataset.day, day = SP.planFor(monday(parseDk(k))).find(d => d.k === k), item = day?.items.find(i => i.key === t.dataset.key); if (item) openMove(item, k); },
  moveday: t => { S.ui.move.day = t.dataset.v; render(); },
  movetime: t => { const v = toMin(t.value); if (v != null) { S.ui.move.s = Math.min(v, 1439 - S.ui.move.len); render(); } },
  movenudge: t => { const m = S.ui.move; m.s = Math.max(0, Math.min(1439 - m.len, m.s + +t.dataset.v)); render(); },
  moveapply: t => { const m = S.ui.move, all = t.dataset.v === 'all'; closeSheet(); SP.moveItem(m.key, m.day, m.s, all ? 'all' : 'one'); toast(all ? `${m.title} now starts at ${fmt(m.s)} from here on.` : `Moved to ${whenTxt(m.day, m.s)}.`); },
  moveundo: () => { const m = S.ui.move; closeSheet(); SP.unmoveItem(m.key); toast('Back to the planned time.'); },
};
// Dragging a block on the week grid: snaps to 15 minutes, can cross days, then asks how far the change should reach.
let drag = null, skipClick = false;
document.addEventListener('pointerdown', e => {
  const b = e.target.closest('[data-drag]');
  if (!b || e.button || S.sheet) return;
  drag = { b, x: e.clientX, y: e.clientY, s: +b.dataset.s, len: +b.dataset.len, day: b.dataset.dk, on: false, id: e.pointerId };
});
document.addEventListener('pointermove', e => {
  const d = drag; if (!d || e.pointerId !== d.id) return;
  if (!d.on) { if (Math.hypot(e.clientX - d.x, e.clientY - d.y) < 6) return; d.on = true; d.b.classList.add('dragging'); try { d.b.setPointerCapture(d.id); } catch {} d.label = d.b.querySelector('span'); d.text = d.label?.textContent; }
  const dS = toMin(S.settings.day.start) ?? 420, dE = toMin(S.settings.day.end) ?? 1380, cols = [...document.querySelectorAll('.wk-body[data-col]')];
  const home = cols.find(c => c.dataset.col === d.day), over = cols.find(c => { const r = c.getBoundingClientRect(); return e.clientX >= r.left && e.clientX < r.right; }) || home;
  const col = over.dataset.col >= todayK() ? over : home;
  const s = Math.max(dS, Math.min(Math.max(dS, dE - d.len), Math.round((d.s + (e.clientY - d.y) / PX) / 15) * 15));
  d.to = { day: col.dataset.col, s };
  d.b.style.transform = `translate(${col.getBoundingClientRect().left - home.getBoundingClientRect().left}px, ${(s - Math.max(d.s, dS)) * PX}px)`;
  if (d.label) d.label.textContent = `${fmt(s)}–${fmt(s + d.len)}`;
});
function endDrag(e, cancel) {
  const d = drag; if (!d || (e.pointerId != null && e.pointerId !== d.id)) return;
  drag = null;
  if (!d.on) return;
  skipClick = true; setTimeout(() => { skipClick = false; }, 80);
  d.b.classList.remove('dragging'); d.b.style.transform = ''; if (d.label) d.label.textContent = d.text;
  if (cancel || !d.to || (d.to.day === d.day && d.to.s === d.s)) return;
  const item = SP.planFor(monday(parseDk(d.day))).flatMap(x => x.items).find(i => i.key === d.b.dataset.drag);
  if (item) openMove(item, d.day, d.to.day, d.to.s);
}
document.addEventListener('pointerup', e => endDrag(e, false));
document.addEventListener('pointercancel', e => endDrag(e, true));

// ---------- survey ----------
function surveySteps() {
  const m = S.settings.mode;
  const steps = [{ id: 'mode', q: 'Which describes you?', sub: 'This decides which planning tools you get.', body: modeBody, ok: () => !!m }];
  if (m === 'both') steps.push({ id: 'terms', q: 'How do your terms go?', sub: 'Sprout switches between study mode and work mode on these dates.', body: termsBody, ok: () => S.settings.terms.some(t => t.start && t.end) });
  if (m === 'work' || m === 'both') steps.push({ id: 'work', q: 'When do you work?', sub: m === 'both' ? 'Used during your work terms.' : '', body: workBody, ok: () => true });
  if (m === 'student' || m === 'both') steps.push({ id: 'classes', q: 'What are you taking?', sub: 'Rate how hard each class is. Harder classes get more study time.', body: classesBody, ok: () => true });
  steps.push({ id: 'goals', q: 'What do you want to make time for?', sub: '', body: goalsBody, ok: () => true });
  steps.push({ id: 'day', q: 'What hours can Sprout use?', sub: '', body: dayBody, ok: () => true });
  steps.push({ id: 'cals', q: 'Which calendar should Sprout fill?', sub: 'Your plan goes straight into Google Calendar and stays up to date.', body: calsBody, ok: () => !!S.settings.cals.write });
  return steps;
}
function drawSurvey() {
  const steps = surveySteps(); S.step = Math.max(0, Math.min(S.step, steps.length - 1));
  const st = steps[S.step], last = S.step === steps.length - 1;
  patchView('survey:' + st.id, [
    ['top', `<div class="s-top">${S.step > 0 ? `<button class="iconbtn" data-act="back" aria-label="Back">${IC.back}</button>` : '<span class="iconbtn ghosted"></span>'}
      <div class="s-bar" role="progressbar" aria-valuenow="${S.step + 1}" aria-valuemax="${steps.length}"><i style="width:${(S.step + 1) / steps.length * 100}%"></i></div><span class="small muted">${S.step + 1}/${steps.length}</span></div>
      <h1>${st.q}</h1>${st.sub ? `<p class="muted">${st.sub}</p>` : ''}`, 's-headwrap'],
    ['body', st.body(), 's-body'],
    ['foot', `<button class="btn primary big grow" data-act="${last ? 'finish' : 'next'}" ${st.ok() ? '' : 'disabled'}>${last ? 'Build my plan' : st.id === 'goals' && !S.goals.list.length ? 'Skip for now' : 'Continue'}</button>`, 's-foot'],
  ]);
}

// ---------- actions ----------
const settingsChanged = opts => SP.changed(opts);
function setPath(p, v) {
  const [r, ...keys] = p.split('.'), base = r === 'd' ? S.draft : r === 'u' ? S.ui : r === 'y' ? S.sd : S.settings;
  let o = base; for (const k of keys.slice(0, -1)) o = o[k];
  o[keys[keys.length - 1]] = v;
  return r;
}
const ACT = {
  signin: () => SP.signIn(),
  signout: () => SP.signOut(),
  reconnect: t => SP.reconnect(t.dataset.v),
  addacct: () => SP.addAccount(),
  acctdel: t => SP.removeAccount(t.dataset.v),
  copy: async t => { try { await navigator.clipboard.writeText(t.dataset.v); toast('Copied.'); } catch { const r = document.createRange(); r.selectNodeContents($('#redirect')); getSelection().removeAllRanges(); getSelection().addRange(r); } },
  tab: t => { S.view = t.dataset.v; S.sheet = null; S.draft = null; render(); },
  sheet: t => openSheet(t.dataset.v),
  closesheet: () => closeSheet(),
  confirm: t => { S.ui.confirm = t.dataset.v || null; render(); },
  wk: t => { const v = +t.dataset.v; S.weekStart = v === 0 ? thisWeek() : addDays(S.weekStart, 7 * v); const wd = SP.wdOf(parseDk(S.selDay)); S.selDay = dk(S.weekStart) === dk(thisWeek()) ? todayK() : dk(addDays(S.weekStart, wd)); render(); SP.refreshEvents(); },
  selday: t => { S.selDay = t.dataset.v; render(); },
  done: t => {
    const k = t.dataset.day, key = t.dataset.key, day = SP.planFor(monday(parseDk(k))).find(d => d.k === k);
    const full = SP.toggleDone(k, key, day?.items.find(i => i.key === key));
    S.ui.pop = S.log.days[k].done[key] ? key : null; try { navigator.vibrate?.(12); } catch {}
    render();
    if (full && k === todayK()) { confetti(); toast('Everything done today. Your plant grew.'); }
  },
  set: t => { const v = t.dataset.n ? +t.dataset.v : t.dataset.v; if (setPath(t.dataset.p, v) === 's') settingsChanged(); else render(); },
  // survey flow
  mode: t => { S.settings.mode = t.dataset.v; settingsChanged(); if (!S.settings.onboarded) setTimeout(() => { if (S.step === 0) { S.step = 1; render(); } }, 260); },
  back: () => { S.step = Math.max(0, S.step - 1); render(); },
  next: () => { S.step++; render(); },
  finish: () => { S.settings.onboarded = true; S.view = 'home'; S.sheet = null; S.weekStart = thisWeek(); S.selDay = todayK(); settingsChanged({ reload: true }); toast('Building your plan and filling your calendar…'); SP.scheduleSync(600); },
  retake: () => { S.settings.onboarded = false; S.step = 0; S.sheet = null; SP.save(); render(); },
  // terms
  termseed: t => { const other = t.dataset.v === 'school' ? 'work' : 'school'; S.settings.terms = SP.nextTerms(3).map((x, i) => ({ id: rid(), type: i % 2 ? other : t.dataset.v, ...x })); settingsChanged(); },
  termtype: t => { const x = S.settings.terms.find(y => y.id === t.dataset.id); if (x) { x.type = t.dataset.v; settingsChanged(); } },
  termedit: t => { S.ui.termEdit = t.dataset.v; render(); },
  termdel: t => { S.settings.terms = S.settings.terms.filter(x => x.id !== t.dataset.v); S.ui.termEdit = null; settingsChanged(); },
  termadd: () => { const ts = S.settings.terms, last = ts[ts.length - 1], x = SP.stdTerm(last?.end ? addDays(parseDk(last.end), 1) : new Date()); ts.push({ id: rid(), type: last?.type === 'school' ? 'work' : 'school', ...x }); settingsChanged(); },
  // work
  workpreset: t => { const p = WORK_PRESETS[+t.dataset.v]; S.ui.workCustom = false; Object.assign(S.settings.work, { source: 'manual', days: [0, 1, 2, 3, 4], start: p[0], end: p[1] }); settingsChanged(); },
  worksrc: t => { S.ui.workCustom = t.dataset.v === 'custom'; S.settings.work.source = t.dataset.v === 'calendar' ? 'calendar' : 'manual'; settingsChanged(); },
  workday: t => { const v = +t.dataset.v, w = S.settings.work; w.days = w.days.includes(v) ? w.days.filter(x => x !== v) : [...w.days, v].sort(); settingsChanged(); },
  // classes
  clsadd: t => { const n = t.dataset.v; S.settings.classes.push({ id: rid(), name: n, match: n, difficulty: 3, at: Date.now() }); settingsChanged(); },
  clsdel: t => { S.settings.classes = S.settings.classes.filter(x => x.id !== t.dataset.v); settingsChanged(); },
  clsdiff: t => { const c = S.settings.classes.find(x => x.id === t.dataset.id); if (c) { c.difficulty = +t.dataset.v; settingsChanged(); } },
  // day
  daypick: t => { S.ui[t.dataset.k === 'start' ? 'wakeCustom' : 'endCustom'] = false; S.settings.day[t.dataset.k] = t.dataset.v; settingsChanged(); },
  daycustom: t => { S.ui[t.dataset.v === 'wake' ? 'wakeCustom' : 'endCustom'] = true; render(); },
  // calendars
  calread: t => { const k = t.dataset.v, c = S.settings.cals; c.read = c.read.includes(k) ? c.read.filter(x => x !== k) : [...c.read, k]; settingsChanged({ reload: true }); },
  calwrite: t => { S.settings.cals.write = t.dataset.v; settingsChanged(); },
  autosync: () => { S.settings.autoSync = !S.settings.autoSync; if (S.settings.autoSync) S.sync = { ...S.sync, state: 'idle', paused: false }; settingsChanged(); },
  syncnow: () => SP.runSync({ manual: true }),
  removeall: () => { S.ui.confirm = null; SP.removeAll(); },
  // goals
  goalquick: t => { const c = CATALOG[+t.dataset.v]; S.goals.list.push({ id: rid(), name: c.name, icon: c.icon, minutes: c.minutes, slot: c.slot, after: '', before: '', days: [...(Array.isArray(c.days) ? c.days : DAYSETS[c.days])], start: todayK(), end: '', during: 'all', at: Date.now() }); try { navigator.vibrate?.(8); } catch {} SP.changed(); },
  goalnew: () => { S.draft = toDraft(blankGoal()); S.draft.named = false; openSheet('goal', { back: S.sheet?.type === 'goals' ? 'goals' : null }); setTimeout(() => $('#g-name')?.focus(), 350); },
  goaledit: t => { const x = S.goals.list.find(y => y.id === t.dataset.v); if (!x) return; S.draft = toDraft(x); openSheet('goal', { back: S.sheet?.type === 'goals' ? 'goals' : null }); },
  goalsave: () => { if (commitGoal()) { closeSheet(); SP.changed(); } },
  goaldel: () => { S.goals.list = S.goals.list.filter(x => x.id !== S.draft.id); closeSheet(); SP.changed(); toast('Goal deleted.'); },
  gdur: t => { const d = S.draft; if (t.dataset.v === 'custom') { d.durCustom = true; d.durText = String(d.minutes || ''); } else { d.durCustom = false; d.minutes = +t.dataset.v; } d.err = ''; render(); },
  gslot: t => { S.draft.slot = t.dataset.v; S.draft.err = ''; render(); },
  gdays: t => { const d = S.draft, v = t.dataset.v; if (v === 'custom' && d.daysMode !== 'custom') d.days = d.days.length ? d.days : [0, 2, 4]; d.daysMode = v; if (v !== 'custom') d.days = [...DAYSETS[v]]; d.err = ''; render(); },
  gday: t => { const v = +t.dataset.v, d = S.draft; d.days = d.days.includes(v) ? d.days.filter(x => x !== v) : [...d.days, v].sort(); render(); },
  guntil: t => { const d = S.draft, v = t.dataset.v; d.untilMode = v; d.end = v === 'term' ? SP.currentTerm()?.end || '' : v === 'ongoing' ? '' : d.end; d.err = ''; render(); },
};
document.addEventListener('click', e => {
  if (skipClick) { e.preventDefault(); return; }
  const t = e.target.closest('[data-act]');
  if (!t || t.disabled) return;
  if (t.tagName !== 'A') e.preventDefault();
  ACT[t.dataset.act]?.(t, e);
});
// Typing updates the saved value quietly; the page redraws when the field is committed.
document.addEventListener('input', e => { const t = e.target; if (t.dataset.in && t.type !== 'time' && t.type !== 'date') setPath(t.dataset.in, t.value); });
document.addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.in) { if (setPath(t.dataset.in, t.value) === 's') settingsChanged(); else render(); if (t.dataset.change) ACT[t.dataset.change]?.(t); }
  else if (t.dataset.term) { const x = S.settings.terms.find(y => y.id === t.dataset.term); if (x) { x[t.dataset.k] = t.value; settingsChanged(); } }
  else if (t.dataset.cls) { const c = S.settings.classes.find(x => x.id === t.dataset.cls), v = t.value.trim(); if (c && v) { if (c.match === c.name) c.match = v; c.name = v; settingsChanged(); } else render(); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  if (ACT['form:' + e.target.dataset.form]) return ACT['form:' + e.target.dataset.form](e.target);
  if (e.target.dataset.form === 'cls') { const v = S.ui.newClass.trim(); if (!v) return; S.settings.classes.push({ id: rid(), name: v, match: v, difficulty: 3, at: Date.now() }); S.ui.newClass = ''; settingsChanged(); }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && S.sheet) closeSheet(); });
wide.addEventListener('change', render);
setInterval(() => { if (S.boot === 'ready' && document.visibilityState === 'visible') render(); }, 60000);   // keeps "up next" and "checked 2 min ago" fresh

Object.assign(ACT, MOVE_ACTS);
SP.ui = { levelName, confetti, $, esc, patch, patchView, render, toast, openSheet, closeSheet, ACT, SHEETS, IC, chip, opt, group, pct, ago, hrs };
if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
draw();
SP.startUi = () => SP.boot().catch(err => { console.error(err); S.boot = SP.A.primary ? 'ready' : 'signin'; S.authMsg = 'Something went wrong starting up. Reload to try again.'; render(); });
})();
