// Sprout study tab: today's queue, deadlines, the focus timer, and the explain-it coach.
(() => {
'use strict';
const SP = window.SP, { S, A } = SP, U = SP.ui;
const { dk, parseDk, addDays, todayK, thisWeek, rid, ls } = SP;
const { $, esc, chip, group, IC, patchView, render, toast, openSheet, closeSheet, ACT, SHEETS, hrs } = U;
const Y = () => S.study;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const round5 = m => Math.round(m / 5) * 5;
const daysTo = k => Math.round((+parseDk(k) - +parseDk(todayK())) / 864e5);
const mmss = ms => { const s = Math.max(0, Math.ceil(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const minTxt = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60}` : ''}`;
S.sd = { task: null, start: null, nt: {}, key: '', feyText: '' };
S.timer = ls.get('timer') || null;
S.fey = null;
const RATE = ['Lost', 'Shaky', 'Getting there', 'Solid', 'Could teach it'];
const MIC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5 11a7 7 0 0 0 14 0M12 18v3"/></svg>';
const PLAY = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.5v13l11-6.500z"/></svg>';

// ---------- courses and topics ----------
const courses = () => S.settings.classes;
const course = id => courses().find(c => c.id === id);
const cname = id => course(id)?.name || 'General';
// Every course always has something to study, even before you add topics.
function allTopics() {
  const real = Y().topics.filter(t => course(t.course));
  return [...real, ...courses().filter(c => !real.some(t => t.course === c.id)).map(c => ({ id: 'gen:' + c.id, course: c.id, name: 'General review', virtual: true }))];
}
const topicById = id => allTopics().find(t => t.id === id);
const diffOf = t => clamp((+course(t.course)?.difficulty || 3) + (t.adj || 0), 1, 5);
const sinceDays = t => t.last ? -daysTo(t.last) : null;
// How long to spend: harder, staler and shakier topics get longer sessions.
function suggestMin(t) {
  const d = diffOf(t), since = sinceDays(t);
  let m = 15 + 5 * d;
  if (since == null) m += 5; else m *= 0.7 + 0.3 * Math.min(2, since / Math.max(1, t.ivl || 1));
  if (t.conf && t.conf <= 2) m += 10;
  if (t.conf >= 4) m -= 5;
  return clamp(round5(m), 15, 50);
}
function todayStudyBudget() {
  const day = SP.planFor(thisWeek()).find(d => d.k === todayK());
  const planned = (day?.items || []).filter(i => i.kind === 'study').reduce((a, i) => a + i.len, 0);
  return planned || 90;
}
const minutesToday = () => Y().sessions.filter(x => dk(new Date(x.at)) === todayK()).reduce((a, x) => a + x.min, 0);
// Today's queue: what is due for review, what you are shaky on, and what has a deadline coming.
function buildQueue() {
  const today = todayK(), items = [];
  for (const t of allTopics()) {
    const press = SP.coursePressure(t.course), conf = t.conf || null, since = sinceDays(t);
    if (t.last === today && (conf || 3) > 2) continue;                 // done for today
    const due = !t.last || (t.due || today) <= today, pressing = press != null && press <= 3 && since !== 0;
    if (!due && !pressing) continue;
    const over = t.last ? Math.max(0, -daysTo(t.due || today)) : 0;
    let p = (t.last ? Math.min(40, over * 8) : 26) + (6 - (conf || 3)) * 6 + diffOf(t) * 3;
    if (press != null) p += press <= 1 ? 40 : press <= 3 ? 28 : press <= 7 ? 14 : 0;
    const why = press != null && press <= 3 ? `deadline ${press === 0 ? 'today' : press === 1 ? 'tomorrow' : `in ${press} days`}` : !t.last ? 'new' : conf && conf <= 2 ? 'you rated it shaky' : over > 0 ? `${over} day${over === 1 ? '' : 's'} overdue` : 'due for review';
    items.push({ kind: 'topic', id: t.id, course: t.course, title: t.name, min: suggestMin(t), p, why });
  }
  for (const k of Y().tasks) {
    if (k.done || !k.due) continue;
    const d = daysTo(k.due); if (d > 7) continue;
    const spent = Y().sessions.filter(x => x.task === k.id).reduce((a, x) => a + x.min, 0), left = Math.max(20, (k.est || 60) - spent);
    items.push({ kind: 'task', id: k.id, course: k.course, title: k.title, min: clamp(round5(left / Math.max(1, d + 1)), 20, 50), p: 52 + (7 - Math.max(0, d)) * 9 + (d < 0 ? 30 : 0),
      why: d < 0 ? 'overdue' : d === 0 ? 'due today' : d === 1 ? 'due tomorrow' : `due in ${d} days` });
  }
  items.sort((a, b) => b.p - a.p);
  const budget = Math.max(25, todayStudyBudget() - minutesToday()), now = []; let total = 0;
  for (const it of items) { if (now.length && total + it.min > budget + 10) break; now.push(it); total += it.min; }
  return { now, later: items.length - now.length, total };
}
let Q = { now: [], later: 0, total: 0 };

// ---------- logging a session and re-queueing its topic ----------
function logSession({ course: cid, topic, topicName, task, min, rate, full, kind }) {
  let t = topic && Y().topics.find(x => x.id === topic);
  const wanted = (topicName || 'General review').trim().toLowerCase();
  if (!t && !task && cid) t = Y().topics.find(x => x.course === cid && x.name.toLowerCase() === wanted);
  if (!t && !task && cid) {   // first session on a new or "general" topic: make it real so it comes back
    t = { id: rid(), course: cid, name: (topicName || 'General review').trim() };
    Y().topics.push(t);
  }
  if (t) {
    // Low confidence brings it back tomorrow; high confidence pushes it out further each time.
    const first = [1, 1, 2, 4, 7][rate - 1], mult = [0.4, 0.6, 1.3, 2, 2.6][rate - 1];
    const ease = [1.2, 1.1, 1, 0.9, 0.8][diffOf(t) - 1];
    t.ivl = clamp(Math.round((t.n ? (t.ivl || 1) * mult : first) * ease), 1, 30);
    if (rate <= 2) t.ivl = 1;
    t.conf = rate; t.last = todayK(); t.due = dk(addDays(new Date(), t.ivl)); t.n = (t.n || 0) + 1;
  }
  const xp = min + (full ? 10 : 0) + (kind === 'feynman' ? 10 : 0);
  Y().sessions.push({ id: rid(), at: Date.now(), course: cid || null, topic: t?.id || null, task: task || null, min, rate, kind: kind || 'focus' });
  if (Y().sessions.length > 1500) Y().sessions.splice(0, Y().sessions.length - 1500);
  SP.addXp(xp);
  tickStudyBlock(cid);
  SP.changed();
  return { xp, next: t ? t.ivl : null };
}
// Enough focused time on a course today checks off that course's study block on the Today tab.
function tickStudyBlock(cid) {
  const day = SP.planFor(thisWeek()).find(d => d.k === todayK()), log = S.log.days[todayK()];
  if (!cid || !day) return;
  const blocks = day.items.filter(i => i.kind === 'study' && i.ref === cid);
  let pool = Y().sessions.filter(x => x.course === cid && dk(new Date(x.at)) === todayK()).reduce((a, x) => a + x.min, 0);
  for (const b of blocks) {
    if (pool < b.len * 0.8) break;
    pool -= b.len;
    if (!log?.done?.[b.key]) SP.toggleDone(todayK(), b.key, b);
  }
}
const { levelOf, levelBase } = SP;
function studyStreak() {
  const days = new Set(Y().sessions.map(x => dk(new Date(x.at))));
  let n = 0, d = new Date();
  if (!days.has(dk(d))) d = addDays(d, -1);
  while (days.has(dk(d))) { n++; d = addDays(d, -1); }
  return n;
}
// Where the last two weeks went, per course and topic.
function timeStats() {
  const since = Date.now() - 14 * 864e5, byC = {}, byT = {};
  for (const x of Y().sessions) {
    if (x.at < since) continue;
    if (x.course) (byC[x.course] = byC[x.course] || { id: x.course, min: 0 }).min += x.min;
    if (x.topic) (byT[x.topic] = byT[x.topic] || { id: x.topic, min: 0 }).min += x.min;
  }
  const cs = courses().map(c => ({ id: c.id, name: c.name, min: byC[c.id]?.min || 0, conf: SP.courseConf(c.id), press: SP.coursePressure(c.id) }));
  const ts = Object.values(byT).map(x => ({ ...x, t: Y().topics.find(t => t.id === x.id) })).filter(x => x.t).sort((a, b) => b.min - a.min);
  return { cs, ts, total: cs.reduce((a, c) => a + c.min, 0) };
}
function imbalance() {
  const { cs, ts, total } = timeStats();
  if (total < 60) return '';
  const strong = cs.filter(c => c.conf >= 4).sort((a, b) => b.min - a.min)[0];
  const weak = cs.filter(c => c !== strong && ((c.conf != null && c.conf < 3) || (c.press != null && c.press <= 7))).sort((a, b) => a.min - b.min)[0];
  if (strong && weak && strong.min >= 60 && weak.min < strong.min * 0.5)
    return `In the last two weeks you put ${hrs(strong.min)} into <b>${esc(strong.name)}</b>, which you already rate ${strong.conf.toFixed(1)} out of 5, and only ${hrs(weak.min)} into <b>${esc(weak.name)}</b>${weak.conf != null && weak.conf < 3 ? `, which you rate ${weak.conf.toFixed(1)}` : weak.press != null ? `, which has a deadline in ${weak.press} day${weak.press === 1 ? '' : 's'}` : ''}. Start with ${esc(weak.name)} today.`;
  const top = ts[0];
  if (top && top.t.conf >= 4 && top.min >= 90 && top.min > total * 0.35 && ts.length > 1)
    return `<b>${esc(top.t.name)}</b> has taken ${hrs(top.min)} of your last two weeks and you already rate it ${top.t.conf} out of 5. Your time will go further on the topics lower in your queue.`;
  return '';
}

// ---------- focus timer ----------
let audio = null, wake = null;
const saveTimer = () => ls.set('timer', S.timer);
function beep() {
  try {
    if (!audio) return;
    [0, 0.25, 0.5].forEach((t, i) => { const o = audio.createOscillator(), g = audio.createGain(); o.frequency.value = [660, 880, 1100][i]; o.connect(g); g.connect(audio.destination);
      g.gain.setValueAtTime(0.0001, audio.currentTime + t); g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + t + 0.22); o.start(audio.currentTime + t); o.stop(audio.currentTime + t + 0.25); });
  } catch {}
  try { navigator.vibrate?.([120, 80, 120]); } catch {}
}
async function holdAwake(on) {
  try { if (on) wake = await navigator.wakeLock?.request('screen'); else { await wake?.release(); wake = null; } } catch {}
}
function startFocus(item, len) {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); audio.resume?.(); } catch {}
  S.timer = { state: 'focus', item, len, endAt: Date.now() + len * 60000 };
  saveTimer(); holdAwake(true);
  S.view = 'study'; S.sheet = null; render(); window.scrollTo({ top: 0, behavior: 'smooth' });
}
const focusedMin = (t, now = Date.now()) => Math.round((t.len * 60000 - (t.state === 'paused' ? t.left : Math.max(0, t.endAt - now))) / 60000);
function finishFocus(full) {
  const t = S.timer, min = full ? t.len : focusedMin(t);
  holdAwake(false);
  if (min < 1) { S.timer = null; saveTimer(); document.title = 'Sprout'; toast('Timer cancelled. Nothing was logged.'); return render(); }
  S.timer = { state: 'rate', item: t.item, min, full }; saveTimer(); document.title = 'Sprout';
  if (full) beep();
  render();
}
setInterval(() => {
  const t = S.timer;
  if (S.fey?.rec === 'rec') { const el = $('#fey-clock'); if (el) el.textContent = mmss(Date.now() - S.fey.recAt); if (Date.now() - S.fey.recAt > 180000) ACT.feystop(); }
  if (!t || (t.state !== 'focus' && t.state !== 'break')) return;
  const left = t.endAt - Date.now();
  if (left <= 0) {
    if (t.state === 'focus') return finishFocus(true);
    S.timer = null; saveTimer(); beep(); toast('Break over. Ready for the next one?'); return render();
  }
  const txt = mmss(left), a = $('#tm-clock'), b = $('#hdr-clock'), ring = $('#tm-ring');
  if (a) a.textContent = txt; if (b) b.textContent = txt;
  if (ring) ring.style.strokeDashoffset = (339.3 * (1 - left / (t.len * 60000))).toFixed(1);
  document.title = `${txt} · Sprout`;
}, 500);
SP.timerPill = () => {
  const t = S.timer;
  if (!t || S.view === 'study' || !['focus', 'paused', 'break', 'rate'].includes(t.state)) return '';
  return `<button class="syncpill tm" data-act="tab" data-v="study"><i></i><span id="hdr-clock">${t.state === 'rate' ? 'Rate it' : t.state === 'paused' ? 'Paused' : mmss(t.endAt - Date.now())}</span></button>`;
};
function timerHTML() {
  const t = S.timer;
  if (!t) return '';
  if (t.state === 'rate') return `<div class="card tm-card rate"><span class="label">${t.kind === 'feynman' ? 'Explained' : 'Session done'} · ${minTxt(t.min)}</span>
      <h2>${esc(t.item.title)}</h2><p class="muted">How confident do you feel about it now?</p>
      <div class="rate-row">${RATE.map((l, i) => `<button data-act="tmrate" data-v="${i + 1}"${t.hint === i + 1 ? ' class="hint"' : ''}><b>${i + 1}</b><small>${l}</small></button>`).join('')}</div>
      ${t.hint ? `<p class="small muted">The coach scored that explanation ${t.hint} out of 5. Your own rating is what counts.</p>` : ''}</div>`;
  if (t.state === 'after') return `<div class="card tm-card"><span class="label">+${t.xp} XP</span><h2>${t.rate <= 2 ? 'Logged. It comes back tomorrow.' : t.next ? `Logged. Back in ${t.next} day${t.next === 1 ? '' : 's'}.` : 'Logged.'}</h2>
      <div class="row"><button class="btn primary grow" data-act="tmbreak">Take a 5 min break</button>${Q.now[0] ? `<button class="btn grow" data-act="qstart" data-i="0">Next: ${esc(Q.now[0].title)}</button>` : ''}<button class="btn ghost" data-act="tmclear">Done</button></div></div>`;
  const brk = t.state === 'break', paused = t.state === 'paused', left = paused ? t.left : t.endAt - Date.now();
  return `<div class="card tm-card ${brk ? 'brk' : ''}">
    <div class="tm-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="54"/><circle id="tm-ring" cx="60" cy="60" r="54" stroke-dasharray="339.300" style="stroke-dashoffset:${(339.3 * (1 - left / (t.len * 60000))).toFixed(1)}"/></svg>
      <div><b id="tm-clock">${mmss(left)}</b><small>${brk ? 'break' : paused ? 'paused' : 'focus'}</small></div></div>
    <div class="tm-info"><span class="label">${brk ? 'Rest your eyes' : esc(cname(t.item.course))}</span><h2>${brk ? 'Break' : esc(t.item.title)}</h2>
      <div class="row">${brk ? `<button class="btn" data-act="tmclear">Skip break</button>` : `<button class="btn" data-act="${paused ? 'tmresume' : 'tmpause'}">${paused ? 'Resume' : 'Pause'}</button><button class="btn primary" data-act="tmdone">Finish</button>`}</div></div></div>`;
}

// ---------- the Study tab ----------
function levelHTML() {
  const xp = S.game.xp || 0, l = levelOf(xp), base = levelBase(l), need = levelBase(l + 1) - base, today = minutesToday();
  const n = Y().sessions.filter(x => dk(new Date(x.at)) === todayK()).length, streak = studyStreak();
  return `<div class="card lvl"><div class="lvl-top"><b>Level ${l} · ${U.levelName(l)}</b><span class="small muted">${xp - base} / ${need} XP</span></div>
    <div class="bar"><i style="width:${(xp - base) / need * 100}%"></i></div>
    <div class="lvl-stats"><span><b>${minTxt(today)}</b> focused today</span><span><b>${n}</b> session${n === 1 ? '' : 's'}</span><span><b>${streak}</b> day streak</span></div></div>`;
}
function queueHTML() {
  if (!courses().length) return `<div class="card center stack"><h2>Add your classes first</h2><p class="muted">Sprout builds your study queue from the classes you are taking.</p><button class="btn primary" data-act="sheet" data-v="classes">Add classes</button></div>`;
  const busy = S.timer && ['focus', 'paused'].includes(S.timer.state);
  return `<div class="sec-head"><h2>Today’s queue</h2><span class="small muted">${Q.now.length ? `about ${minTxt(Q.total)}` : ''}</span></div>
    ${Q.now.length ? `<div class="stack">${Q.now.map((it, i) => `<div class="q-item${i === 0 && !busy ? ' first' : ''}">
        <div class="q-main"><b>${esc(it.title)}</b><small>${esc(cname(it.course))} · ${esc(it.why)}</small></div>
        <span class="q-min">${it.min} min</span>
        ${it.kind === 'topic' ? `<button class="iconbtn" data-act="feystart" data-i="${i}" aria-label="Explain ${esc(it.title)} out loud">${MIC}</button>` : ''}
        <button class="iconbtn go" data-act="qstart" data-i="${i}" aria-label="Start ${esc(it.title)}" ${busy ? 'disabled' : ''}>${PLAY}</button></div>`).join('')}</div>
      ${Q.later ? `<p class="hint">${Q.later} more can wait until tomorrow.</p>` : ''}`
      : `<p class="empty">You are caught up for today. Anything you study now still counts.</p>`}
    <div class="row"><button class="btn grow" data-act="startpick">${IC.plus}Study something else</button><button class="btn grow" data-act="sheet" data-v="topics">Topics</button></div>`;
}
function dueLabel(ms, allDay) {
  const d = Math.floor((ms - +parseDk(todayK())) / 864e5), date = new Date(ms).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const time = allDay ? '' : `, ${SP.fmt(new Date(ms).getHours() * 60 + new Date(ms).getMinutes())}`;
  return { cls: d < 0 ? 'over' : d <= 2 ? 'soon' : '', text: d < 0 ? `Overdue · ${date}` : d === 0 ? `Today${time}` : d === 1 ? `Tomorrow${time}` : `${date} · in ${d} days` };
}
function deadlinesHTML() {
  const rows = [
    ...Y().tasks.filter(k => !k.done).map(k => ({ ms: k.due ? +parseDk(k.due) : Infinity, allDay: true, title: k.title, course: k.course, act: `data-act="taskdone" data-v="${k.id}"`, edit: `data-act="taskedit" data-v="${k.id}"` })),
    ...S.deadlines.filter(d => !Y().hidden.includes(d.id)).map(d => ({ ms: d.due, allDay: d.allDay, title: d.title, course: d.course, cal: true, act: `data-act="dlhide" data-v="${esc(d.id)}"` })),
  ].sort((a, b) => a.ms - b.ms);
  return `<div class="sec-head"><h2>Deadlines</h2><button class="link" data-act="tasknew">Add assignment</button></div>
    ${rows.length ? `<div class="list card">${rows.slice(0, 12).map(r => { const l = Number.isFinite(r.ms) ? dueLabel(r.ms, r.allDay) : { cls: '', text: 'No due date' };
      return `<div class="dl"><button class="dl-check" ${r.act} aria-label="Mark ${esc(r.title)} done"></button>
        <${r.edit ? `button ${r.edit}` : 'div'} class="dl-main"><b>${esc(r.title)}</b><small class="${l.cls}">${l.text}${r.course ? ` · ${esc(cname(r.course))}` : ''}${r.cal ? ' · from your calendar' : ''}</small></${r.edit ? 'button' : 'div'}></div>`; }).join('')}</div>`
      : `<p class="empty">Nothing due. Sprout picks up exams and due dates from your calendar, and you can add your own.</p>`}`;
}
function timeHTML() {
  const { cs, ts, total } = timeStats(), max = Math.max(1, ...cs.map(c => c.min));
  if (!courses().length) return '';
  return `<div class="card stack"><h3>Where your time went · 14 days</h3>
    ${cs.map(c => `<div class="hbar study"><span>${esc(c.name)}</span><i><b style="width:${c.min / max * 100}%"></b></i><em>${hrs(c.min)}</em></div><p class="conf">${c.conf == null ? 'Not rated yet' : `Confidence ${c.conf.toFixed(1)} of 5`}${c.press != null && c.press <= 7 ? ` · deadline in ${c.press} day${c.press === 1 ? '' : 's'}` : ''}</p>`).join('')}
    ${ts.length ? `<span class="label">By topic</span>${ts.slice(0, 6).map(x => `<div class="trow"><span>${esc(x.t.name)}</span><small>${esc(cname(x.t.course))} · confidence ${x.t.conf || '–'}</small><em>${hrs(x.min)}</em></div>`).join('')}` : total ? '' : '<p class="empty">Run a focus session to start tracking.</p>'}</div>`;
}
SP.drawStudy = () => {
  SP.loadDeadlines();
  Q = courses().length ? buildQueue() : { now: [], later: 0, total: 0 };   // before the timer card, which offers the next item
  const warn = imbalance();
  patchView('study', [
    ['timer', timerHTML()],
    ['level', levelHTML()],
    ['warn', warn ? `<p class="note warn">${warn}</p>` : ''],
    ['queue', queueHTML()],
    ['deadlines', courses().length ? deadlinesHTML() : ''],
    ['time', timeHTML()],
  ]);
};

// ---------- sheets: start picker, assignment, topics ----------
SHEETS.start = { title: 'What are you studying?', foot: () => `<button class="btn primary grow" data-act="startgo">Start ${S.sd.start.len} min</button>`, body: () => {
  const d = S.sd.start, ts = Y().topics.filter(t => t.course === d.course);
  return `${group('Course', `<div class="chips">${courses().map(c => chip(esc(c.name), d.course === c.id, `data-act="startset" data-k="course" data-v="${c.id}"`)).join('')}</div>`)}
    ${group('Topic', `<div class="chips">${chip('General review', !d.topic && !d.name, 'data-act="startset" data-k="topic" data-v=""')}${ts.map(t => chip(esc(t.name), d.topic === t.id, `data-act="startset" data-k="topic" data-v="${t.id}"`)).join('')}</div>
      <input id="st-name" data-in="y.start.name" data-change="startname" value="${esc(d.name)}" placeholder="Or name a new topic" enterkeyhint="done">`, 'New topics are added to your queue and come back on their own.')}
    ${group('How long', `<div class="chips">${[15, 25, 35, 50].map(m => chip(`${m} min`, d.len === m, `data-act="startset" data-k="len" data-v="${m}"`)).join('')}</div>`)}`;
} };
SHEETS.task = { title: () => S.sd.task.id ? 'Assignment' : 'New assignment',
  foot: () => `${S.sd.task.id ? '<button class="btn danger" data-act="taskdel">Delete</button>' : ''}<button class="btn primary grow" data-act="tasksave">${S.sd.task.id ? 'Save' : 'Add'}</button>`,
  body: () => { const d = S.sd.task, q = [[0, 'Today'], [1, 'Tomorrow'], [3, 'In 3 days'], [7, 'In a week']];
    return `<label class="field"><span>What is it?</span><input id="tk-title" data-in="y.task.title" value="${esc(d.title)}" placeholder="e.g. Assignment 4" enterkeyhint="done"></label>
      ${group('Course', `<div class="chips">${courses().map(c => chip(esc(c.name), d.course === c.id, `data-act="taskset" data-k="course" data-v="${c.id}"`)).join('')}${chip('Other', !d.course, 'data-act="taskset" data-k="course" data-v=""')}</div>`)}
      ${group('Due', `<div class="chips">${q.map(([n, l]) => chip(l, !d.pick && d.due === dk(addDays(new Date(), n)), `data-act="taskdue" data-v="${n}"`)).join('')}${chip('Pick a date', d.pick, 'data-act="taskdue" data-v="pick"')}</div>
        ${d.pick ? `<input type="date" id="tk-due" data-in="y.task.due" value="${esc(d.due)}" aria-label="Due date">` : ''}`)}
      ${group('About how much work', `<div class="chips">${[[30, '30 min'], [60, '1 h'], [120, '2 h'], [180, '3 h'], [300, '5 h']].map(([m, l]) => chip(l, d.est === m, `data-act="taskset" data-k="est" data-v="${m}" data-n="1"`)).join('')}</div>`, 'Sprout spreads this over the days you have left.')}
      ${d.err ? `<p class="note bad">${esc(d.err)}</p>` : ''}`; } };
SHEETS.topics = { title: 'Topics', body: () => courses().length ? courses().map(c => {
  const ts = Y().topics.filter(t => t.course === c.id);
  return `<div class="group"><span class="label">${esc(c.name)}</span>
    ${ts.length ? `<div class="list card">${ts.map(t => `<div class="tp"><div class="tp-main"><b>${esc(t.name)}</b><small>${t.last ? `confidence ${t.conf} · ${daysTo(t.due) <= 0 ? 'due now' : `back in ${daysTo(t.due)} day${daysTo(t.due) === 1 ? '' : 's'}`}` : 'not studied yet'}</small></div>
        <div class="seg mini">${[[-1, 'Easier'], [0, 'Normal'], [1, 'Harder']].map(([v, l]) => `<button type="button" aria-pressed="${(t.adj || 0) === v}" data-act="tpadj" data-id="${t.id}" data-v="${v}">${l}</button>`).join('')}</div>
        <button class="iconbtn" data-act="tpdel" data-v="${t.id}" aria-label="Remove ${esc(t.name)}">${IC.close}</button></div>`).join('')}</div>` : ''}
    <form class="addline" data-form="topic" data-course="${c.id}"><input id="nt-${c.id}" data-in="y.nt.${c.id}" value="${esc(S.sd.nt[c.id] || '')}" placeholder="Add a topic, e.g. Integration by parts" enterkeyhint="done"><button class="btn" type="submit">Add</button></form></div>`; }).join('')
  : '<p class="empty">Add your classes in Setup first.</p>' };

Object.assign(ACT, {
  qstart: t => { const it = Q.now[+t.dataset.i]; if (it) startFocus({ kind: it.kind, course: it.course, topic: it.kind === 'topic' && !it.id.startsWith('gen:') ? it.id : null, task: it.kind === 'task' ? it.id : null, topicName: it.title, title: it.title }, it.min); },
  startpick: () => { S.sd.start = { course: courses()[0]?.id || '', topic: '', name: '', len: 25 }; openSheet('start'); },
  startset: t => { const d = S.sd.start, k = t.dataset.k; d[k] = k === 'len' ? +t.dataset.v : t.dataset.v; if (k === 'course') d.topic = ''; if (k !== 'len') d.name = k === 'topic' ? '' : d.name; render(); },
  startname: () => { if (S.sd.start.name.trim()) S.sd.start.topic = ''; render(); },
  startgo: () => { const d = S.sd.start, name = d.name.trim(), t = Y().topics.find(x => x.id === d.topic); if (!d.course) return toast('Pick a course first.');
    startFocus({ kind: 'topic', course: d.course, topic: t?.id || null, topicName: name || t?.name || 'General review', title: name || t?.name || 'General review' }, d.len); },
  tmpause: () => { const t = S.timer; t.left = t.endAt - Date.now(); t.state = 'paused'; saveTimer(); holdAwake(false); render(); },
  tmresume: () => { const t = S.timer; t.endAt = Date.now() + t.left; t.state = 'focus'; saveTimer(); holdAwake(true); render(); },
  tmdone: () => finishFocus(false),
  tmrate: t => { const tm = S.timer, rate = +t.dataset.v, r = logSession({ ...tm.item, min: tm.min, rate, full: tm.full, kind: tm.kind });
    S.timer = { state: 'after', xp: r.xp, next: r.next, rate }; saveTimer(); document.title = 'Sprout'; render(); },
  tmbreak: () => { S.timer = { state: 'break', len: 5, endAt: Date.now() + 5 * 60000 }; saveTimer(); render(); },
  tmclear: () => { S.timer = null; saveTimer(); document.title = 'Sprout'; render(); },
  tasknew: () => { S.sd.task = { title: '', course: courses()[0]?.id || '', due: dk(addDays(new Date(), 3)), est: 60, pick: false }; openSheet('task'); setTimeout(() => $('#tk-title')?.focus(), 350); },
  taskedit: t => { const k = Y().tasks.find(x => x.id === t.dataset.v); if (!k) return; const quick = [0, 1, 3, 7].some(n => dk(addDays(new Date(), n)) === k.due); S.sd.task = { ...k, pick: !quick }; openSheet('task'); },
  taskset: t => { S.sd.task[t.dataset.k] = t.dataset.n ? +t.dataset.v : t.dataset.v; S.sd.task.err = ''; render(); },
  taskdue: t => { const d = S.sd.task; if (t.dataset.v === 'pick') d.pick = true; else { d.pick = false; d.due = dk(addDays(new Date(), +t.dataset.v)); } render(); },
  tasksave: () => { const d = S.sd.task, title = d.title.trim();
    if (!title) { d.err = 'Give it a name.'; return render(); }
    if (!d.due) { d.err = 'Pick a due date.'; return render(); }
    const k = { id: d.id || rid(), title, course: d.course || null, due: d.due, est: d.est, done: false, at: d.at || Date.now() }, i = Y().tasks.findIndex(x => x.id === k.id);
    if (i >= 0) Y().tasks[i] = k; else Y().tasks.push(k);
    closeSheet(); SP.changed(); toast(i >= 0 ? 'Saved.' : 'Assignment added.'); },
  taskdel: () => { Y().tasks = Y().tasks.filter(x => x.id !== S.sd.task.id); closeSheet(); SP.changed(); },
  taskdone: t => { const k = Y().tasks.find(x => x.id === t.dataset.v); if (k) { k.done = true; k.doneAt = Date.now(); SP.addXp(20); SP.changed(); toast('Done. +20 XP'); } },
  dlhide: t => { Y().hidden.push(t.dataset.v); if (Y().hidden.length > 300) Y().hidden.shift(); SP.changed(); toast('Marked done.'); },
  tpadj: t => { const x = Y().topics.find(y => y.id === t.dataset.id); if (x) { x.adj = +t.dataset.v; SP.changed({ sync: false }); } },
  tpdel: t => { Y().topics = Y().topics.filter(x => x.id !== t.dataset.v); SP.changed({ sync: false }); },
  'form:topic': f => { const c = f.dataset.course, v = (S.sd.nt[c] || '').trim(); if (!v) return; Y().topics.push({ id: rid(), course: c, name: v }); S.sd.nt[c] = ''; SP.changed({ sync: false }); },
});

// ---------- explain-it coach (Feynman technique) ----------
const getKey = () => ls.get('gemini') || '';
const micOk = () => !!(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);
const SYS = `You are a study coach running the Feynman technique with a university student. They explain a topic in their own words, often by voice, and you help them find what they do not truly understand.

Each turn, respond ONLY with JSON matching the schema:
- heard: a faithful written version of what the student just said (clean up filler words, keep their meaning and their mistakes). If they typed, repeat it briefly.
- right: up to 3 short points they explained correctly. Be specific, never generic praise. Empty if nothing was right.
- fixes: each thing they got wrong or said misleadingly. "said" quotes or paraphrases their claim; "actually" gives the correct idea in one or two plain sentences.
- gaps: important parts of the topic they skipped, or jargon they used without explaining it. Up to 3.
- question: exactly ONE probing follow-up that tests real understanding of something they said. Rotate through kinds: "Why does that step work?", "What happens if this assumption changes?", "Give me a concrete example", "How does this connect to <related idea>?", "Where does this break down?". Aim it at their weakest point. Never ask them to simply repeat a definition.
- score: 1 to 5 for how well they understand the topic so far (1 lost, 3 gets the main idea with real gaps, 5 could teach it).
- wrap: one sentence on the single most useful thing to work on next.

Rules: be direct and brief, like a good tutor, not a lecturer. Do not give away the answer to your own question. Use plain language. If the audio is silent or off-topic, say so in "wrap", leave the lists empty and ask them to try again. After the student has answered four follow-up questions, set "question" to an empty string and make "wrap" a short overall verdict.`;
const SCHEMA = { type: 'OBJECT', properties: {
  heard: { type: 'STRING' }, right: { type: 'ARRAY', items: { type: 'STRING' } },
  fixes: { type: 'ARRAY', items: { type: 'OBJECT', properties: { said: { type: 'STRING' }, actually: { type: 'STRING' } }, required: ['said', 'actually'] } },
  gaps: { type: 'ARRAY', items: { type: 'STRING' } }, question: { type: 'STRING' }, score: { type: 'INTEGER' }, wrap: { type: 'STRING' },
}, required: ['heard', 'right', 'fixes', 'gaps', 'question', 'score', 'wrap'] };
const MODELS = [SP.CFG.geminiModel, 'gemini-flash-latest', 'gemini-2.5-flash'].filter(Boolean);
async function askGemini(contents) {
  let lastErr = null;
  for (const model of MODELS) {
    let res;
    try {
      res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': getKey() },
        body: JSON.stringify({ system_instruction: { parts: [{ text: SYS }] }, contents, generationConfig: { responseMimeType: 'application/json', responseSchema: SCHEMA, temperature: 0.4 } }) });
    } catch { throw { msg: 'Could not reach Gemini. Check your connection and try again.' }; }
    if (res.status === 404) { lastErr = { msg: `Gemini does not know the model “${model}”.` }; continue; }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      const m = body.error?.message || '';
      if (res.status === 429) throw { msg: 'You have hit the free Gemini limit for now. Wait a minute and try again.' };
      if (res.status === 400 && /api key/i.test(m) || res.status === 401 || res.status === 403) throw { msg: 'Gemini did not accept that API key. Check it in Setup.', key: true };
      throw { msg: `Gemini returned an error: ${m || res.status}` };
    }
    const text = (body.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('');
    if (!text) throw { msg: 'Gemini gave no answer' + (body.promptFeedback?.blockReason ? ` (${body.promptFeedback.blockReason})` : '') + '. Try again.' };
    try { return JSON.parse(text); } catch { throw { msg: 'Gemini’s answer came back garbled. Try again.' }; }
  }
  throw lastErr;
}
// A stand-in coach for the demo, so the flow can be tried without a key.
async function demoCoach(f) {
  await new Promise(r => setTimeout(r, 900));
  const n = f.turns.filter(x => x.role === 'coach').length, qs = ['Why does that step work? Walk me through the reason, not the rule.', 'What happens if that assumption changes?', 'Give me one concrete example with real numbers.', 'Where does this idea stop working?'];
  return { heard: f.pendingText || '(your spoken explanation would be written out here)', right: n ? ['You tied your answer back to the main idea.'] : ['You named what the topic is for before diving into steps.'],
    fixes: n ? [] : [{ said: 'This is a sample correction.', actually: 'With a Gemini key, the coach quotes what you actually said and explains what is really true.' }],
    gaps: n ? [] : ['You used a term without saying what it means.'], question: qs[n] || '', score: Math.min(5, 2 + n), wrap: n >= 4 ? 'Sample verdict: you have the main idea; tighten the reasoning behind each step.' : 'This is demo feedback. Add a free Gemini key in Setup for real corrections.' };
}
function historyContents(f, parts) {
  const out = [{ role: 'user', parts: [{ text: `Course: ${cname(f.course)}. Topic I am explaining: ${f.title}.` }] }, { role: 'model', parts: [{ text: JSON.stringify({ heard: '', right: [], fixes: [], gaps: [], question: `Explain ${f.title} as if I had never seen it.`, score: 3, wrap: '' }) }] }];
  for (const t of f.turns) out.push(t.role === 'user' ? { role: 'user', parts: [{ text: t.text || '(spoken answer)' }] } : { role: 'model', parts: [{ text: JSON.stringify(t.data) }] });
  out.push({ role: 'user', parts });
  return out;
}
async function sendTurn(parts, shown) {
  const f = S.fey; f.busy = true; f.err = ''; f.pendingText = shown; render(); scrollFey();
  try {
    const data = getKey() ? await askGemini(historyContents(f, parts)) : await demoCoach(f);
    if (S.fey !== f) return;
    f.turns.push({ role: 'user', text: shown || data.heard, spoken: !shown }, { role: 'coach', data });
  } catch (e) { if (S.fey !== f) return; f.err = e?.msg || 'Something went wrong. Try again.'; }
  f.busy = false; f.pendingText = ''; render(); scrollFey();
}
const scrollFey = () => setTimeout(() => { const b = $('#sheet .sheet-body'); if (b) b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); }, 60);
// Recordings are converted to small mono WAV, a format Gemini is sure to accept on every phone and browser.
let rec = null;
async function toWavBase64(blob) {
  const AC = window.AudioContext || window.webkitAudioContext, ctx = new AC();
  const src = await new Promise(async (res, rej) => ctx.decodeAudioData(await blob.arrayBuffer(), res, rej));
  ctx.close?.();
  const rate = 16000, off = new (window.OfflineAudioContext || window.webkitOfflineAudioContext)(1, Math.max(1, Math.ceil(src.duration * rate)), rate), node = off.createBufferSource();
  node.buffer = src; node.connect(off.destination); node.start();
  const pcm = (await off.startRendering()).getChannelData(0), dv = new DataView(new ArrayBuffer(44 + pcm.length * 2)), w = (o, s) => [...s].forEach((c, i) => dv.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); dv.setUint32(4, 36 + pcm.length * 2, true); w(8, 'WAVEfmt '); dv.setUint32(16, 16, true); dv.setUint16(20, 1, true); dv.setUint16(22, 1, true);
  dv.setUint32(24, rate, true); dv.setUint32(28, rate * 2, true); dv.setUint16(32, 2, true); dv.setUint16(34, 16, true); w(36, 'data'); dv.setUint32(40, pcm.length * 2, true);
  for (let i = 0; i < pcm.length; i++) dv.setInt16(44 + i * 2, Math.max(-1, Math.min(1, pcm[i])) * 32767, true);
  return b64(new Uint8Array(dv.buffer));
}
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); }
function stopMic() { try { rec?.stream.getTracks().forEach(t => t.stop()); } catch {} rec = null; }
SP.onSheetClose = sh => { if (sh?.type === 'feynman') { stopMic(); if (S.fey) S.fey.rec = ''; } };

function coachCard(d) {
  const li = a => a.map(x => `<li>${esc(x)}</li>`).join('');
  return `<div class="coach">
    ${d.right?.length ? `<div class="c-sec ok"><span class="label">You got right</span><ul>${li(d.right)}</ul></div>` : ''}
    ${d.fixes?.length ? `<div class="c-sec fix"><span class="label">Fix these</span>${d.fixes.map(x => `<p><s>${esc(x.said)}</s><br>${esc(x.actually)}</p>`).join('')}</div>` : ''}
    ${d.gaps?.length ? `<div class="c-sec gap"><span class="label">You skipped</span><ul>${li(d.gaps)}</ul></div>` : ''}
    ${d.wrap ? `<p class="small muted">${esc(d.wrap)}</p>` : ''}
    <div class="c-score">${[1, 2, 3, 4, 5].map(n => `<i class="${n <= d.score ? 'on' : ''}"></i>`).join('')}<span class="small muted">${RATE[clamp(d.score, 1, 5) - 1]}</span></div>
    ${d.question ? `<p class="c-q">${esc(d.question)}</p>` : ''}</div>`;
}
function keySetupHTML() {
  return `<p>The coach runs on Google’s Gemini, using a free key that belongs to you.</p>
    <ol class="steps"><li>Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener">aistudio.google.com/apikey</a> and sign in.</li><li>Tap <b>Create API key</b> and copy it.</li><li>Paste it here.</li></ol>
    <form class="addline" data-form="aikey"><input id="ai-key" data-in="y.key" value="${esc(S.sd.key)}" placeholder="Paste your Gemini API key" autocomplete="off" autocapitalize="off" spellcheck="false"><button class="btn primary" type="submit">Save</button></form>
    <p class="hint">The key is kept on this device only. What you record or type is sent to Google to be checked; on the free plan Google may use it to improve its models, so leave out anything private.</p>`;
}
SHEETS.aikey = { title: 'Explain-it coach', body: () => getKey() ? `<div class="syncbig ok"><i></i><div><b>Gemini key saved</b><small>Kept on this device only. On another device, add it there too.</small></div></div>
    <p class="hint">In the Study tab, tap the microphone next to a topic and explain it out loud. The coach corrects you and asks follow-up questions.</p>
    <button class="link danger" data-act="aikeydel">Remove the key from this device</button>` : keySetupHTML() };
SHEETS.feynman = { title: () => `Explain: ${S.fey.title}`,
  foot: () => S.fey.turns.length ? `<button class="btn primary grow" data-act="feydone">Finish and rate</button>` : `<button class="btn grow" data-act="closesheet">Close</button>`,
  body: () => {
    const f = S.fey;
    if (!getKey() && !SP.DEMO) return keySetupHTML();
    const last = [...f.turns].reverse().find(t => t.role === 'coach'), over = last && !last.data.question;
    return `${f.turns.length ? '' : `<p class="note">Explain <b>${esc(f.title)}</b> out loud as if teaching someone who has never seen it. No notes, plain words. The coach will correct you and push on the weak spots.</p>`}
      <div class="thread">${f.turns.map(t => t.role === 'user' ? `<div class="me">${t.spoken ? '<span class="label">What it heard</span>' : ''}${esc(t.text)}</div>` : coachCard(t.data)).join('')}
        ${f.pendingText ? `<div class="me">${esc(f.pendingText)}</div>` : ''}</div>
      ${f.err ? `<p class="note bad">${esc(f.err)}</p>` : ''}
      ${f.busy ? `<div class="thinking"><div class="spinner"></div><span>${f.rec === 'proc' ? 'Listening back…' : 'The coach is thinking…'}</span></div>`
        : over ? `<p class="note">That is the end of this round. Finish below, or explain it again from the top.</p><button class="btn" data-act="feyagain">Explain it again</button>`
        : f.rec === 'rec' ? `<button class="recbtn on" data-act="feystop"><span></span><b id="fey-clock">0:00</b><small>Tap when you are done</small></button>`
        : `${micOk() ? `<button class="recbtn" data-act="feyrec">${MIC}<b>${f.turns.length ? 'Answer out loud' : 'Tap and explain'}</b><small>Up to 3 minutes</small></button>` : '<p class="hint">This browser cannot record here, so type your explanation instead.</p>'}
          <form class="typed" data-form="feytext"><textarea id="fey-text" data-in="y.feyText" rows="3" placeholder="Or type it">${esc(S.sd.feyText)}</textarea><button class="btn" type="submit">Send</button></form>`}`;
  } };
SP.coachRow = () => `<button class="listrow" data-act="sheet" data-v="aikey"><b>Explain-it coach</b><span>${getKey() ? 'Gemini key saved' : 'Add a free Gemini key'}</span>${IC.chev}</button>`;
Object.assign(ACT, {
  feystart: t => { const it = Q.now[+t.dataset.i]; if (!it) return; S.fey = { course: it.course, topic: it.id.startsWith('gen:') ? null : it.id, title: it.title, turns: [], startedAt: Date.now(), rec: '', busy: false, err: '' }; S.sd.feyText = ''; openSheet('feynman'); },
  feyagain: () => { S.fey.turns = []; S.fey.err = ''; render(); },
  feyrec: async () => {
    const f = S.fey;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true }), chunks = [];
      rec = new MediaRecorder(stream); rec.chunks = chunks; rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); }; rec.start();
      f.rec = 'rec'; f.recAt = Date.now(); f.err = ''; render();
    } catch (e) { f.err = e?.name === 'NotAllowedError' ? 'Sprout needs permission to use the microphone. Allow it in your browser settings, or type your explanation.' : 'The microphone did not start. You can type your explanation instead.'; render(); }
  },
  feystop: async () => {
    const f = S.fey, r = rec; if (!f || f.rec !== 'rec' || !r) return;
    f.rec = 'proc'; f.busy = true; render();
    await new Promise(res => { r.onstop = res; try { r.stop(); } catch { res(); } });
    const blob = new Blob(r.chunks, { type: r.mimeType || 'audio/webm' }); stopMic();
    if (Date.now() - f.recAt < 1500 || !blob.size) { f.rec = ''; f.busy = false; f.err = 'That was too short to hear. Hold on a little longer.'; return render(); }
    let part;
    try { part = { inline_data: { mime_type: 'audio/wav', data: await toWavBase64(blob) } }; }
    catch { part = { inline_data: { mime_type: (blob.type || 'audio/webm').split(';')[0], data: b64(new Uint8Array(await blob.arrayBuffer())) } }; }
    f.rec = '';
    await sendTurn([part, { text: f.turns.length ? 'This recording is my answer to your question.' : 'This recording is my explanation of the topic.' }], '');
  },
  'form:feytext': () => { const v = S.sd.feyText.trim(); if (!v || S.fey.busy) return; S.sd.feyText = ''; sendTurn([{ text: v }], v); },
  feydone: () => { const f = S.fey, last = [...f.turns].reverse().find(t => t.role === 'coach');
    S.timer = { state: 'rate', kind: 'feynman', item: { kind: 'topic', course: f.course, topic: f.topic, topicName: f.title, title: f.title }, min: clamp(Math.round((Date.now() - f.startedAt) / 60000), 1, 60), hint: last ? clamp(last.data.score, 1, 5) : 0 };
    saveTimer(); S.fey = null; S.view = 'study'; closeSheet(); window.scrollTo({ top: 0, behavior: 'smooth' }); },
  'form:aikey': () => { const v = S.sd.key.trim(); if (v.length < 20) return toast('That does not look like a full key.'); ls.set('gemini', v); S.sd.key = ''; toast('Key saved on this device.'); render(); },
  aikeydel: () => { ls.set('gemini', null); render(); },
});

SP.startUi();
})();
