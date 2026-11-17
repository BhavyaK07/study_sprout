// Sprout core: Google sign-in, saved data, calendar reading, the planner, and calendar filling.
// The screens live in ui.js. Everything shared hangs off window.SP.
(() => {
'use strict';
const SP = window.SP = {};
const CFG = window.SPROUT_CONFIG || {};
const DEMO = SP.DEMO = new URLSearchParams(location.search).has('demo');
const CLIENT_ID = SP.CLIENT_ID = (CFG.googleClientId || '').trim();
const REDIRECT = SP.REDIRECT = location.origin + location.pathname.replace(/index\.html$/, '');
const SC = {
  events: 'https://www.googleapis.com/auth/calendar.events',
  eventsRO: 'https://www.googleapis.com/auth/calendar.events.readonly',
  calendar: 'https://www.googleapis.com/auth/calendar',
  list: 'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
  drive: 'https://www.googleapis.com/auth/drive.appdata',
};
// The main account can add events and save your plan; extra accounts are read-only.
const SCOPE_MAIN = ['openid', 'email', 'profile', SC.events, SC.list, SC.drive];
const SCOPE_EXTRA = ['openid', 'email', 'profile', SC.eventsRO, SC.list];
const API = 'https://www.googleapis.com';
const DATA_FILE = 'sprout-data.json';
const MARK = 'Planned by Sprout';
const TZ = Intl.DateTimeFormat().resolvedOptions().timeZone;
const FILL_WEEKS = SP.FILL_WEEKS = 4;   // weeks ahead kept filled in Google Calendar
const POLL_MS = 120000;                 // how often the calendar is re-checked while open

// ---------- helpers ----------
const pad = n => String(n).padStart(2, '0');
const dk = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDk = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const monday = d => { const x = new Date(d.getFullYear(), d.getMonth(), d.getDate()); return addDays(x, -((x.getDay() + 6) % 7)); };
const toMin = t => { if (!t) return null; const [h, m] = String(t).split(':').map(Number); return Number.isFinite(h) ? h * 60 + (m || 0) : null; };
const fromMin = m => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
const fmt = m => { let h = Math.floor(m / 60); const mm = m % 60; const ap = h >= 12 && h < 24 ? 'pm' : 'am'; h = h % 12 || 12; return mm ? `${h}:${pad(mm)}${ap}` : `${h}${ap}`; };
const localIso = (k, min) => `${k}T${fromMin(Math.min(min, 1439))}:00`;
const msToLocalIso = ms => { const d = new Date(ms); return `${dk(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`; };
const rid = () => Math.random().toString(36).slice(2, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));
const WD = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const wdOf = d => (d.getDay() + 6) % 7;
const durTxt = m => m < 60 ? `${m} min` : `${(m / 60).toFixed(2).replace(/\.?0+$/, '')} h`;
const todayK = () => dk(new Date());
const thisWeek = () => monday(new Date());
const clone = o => JSON.parse(JSON.stringify(o));
const niceDate = k => parseDk(k).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const PFX = DEMO ? 'sprout-demo:' : 'sprout:';   // the demo keeps its own data
const store = s => ({
  get: k => { try { return JSON.parse(s().getItem(PFX + k)); } catch { return null; } },
  set: (k, v) => { try { if (v == null) s().removeItem(PFX + k); else s().setItem(PFX + k, JSON.stringify(v)); } catch {} },
});
const ls = store(() => localStorage), ss = store(() => sessionStorage);
function parseDur(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return null;
  let m;
  if ((m = s.match(/^(\d+):(\d{1,2})$/))) return +m[1] * 60 + +m[2];
  if ((m = s.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m(?:in(?:utes?)?)?)?$/))) return Math.round(+m[1] * 60 + (+m[2] || 0));
  if ((m = s.match(/^(\d+)\s*(?:m|min|mins|minutes?)?$/))) return +m[1];
  return NaN;
}
const deepMerge = (base, over) => {
  if (!over || typeof over !== 'object' || Array.isArray(over)) return over ?? base;
  const out = { ...base };
  for (const k of Object.keys(over)) out[k] = (base && typeof base[k] === 'object' && !Array.isArray(base[k])) ? deepMerge(base[k], over[k]) : over[k];
  return out;
};
// Runs async jobs a few at a time, in order of arrival.
async function pool(items, n, fn) {
  let i = 0, err = null;
  await Promise.all([...Array(Math.min(n, items.length))].map(async () => {
    while (i < items.length && !err) { const it = items[i++]; try { await fn(it); } catch (e) { err = err || e; } }
  }));
  if (err) throw err;
}

// Times of day a goal can prefer. null means "use the edge of your day".
const SLOTS = SP.SLOTS = {
  morning: { label: 'Morning', a: null, b: 600 },
  midday: { label: 'Midday', a: 690, b: 840 },
  afternoon: { label: 'Afternoon', a: 840, b: 1050 },
  evening: { label: 'Evening', a: 1050, b: 1260 },
  night: { label: 'Night', a: 1200, b: null },
};
// Fallbacks for goals with no chosen time or length.
const AUTO = [
  { re: /work ?out|gym|run|lift|exercise|yoga|swim|bike|cardio|sport|train/i, slot: 'evening', len: 60 },
  { re: /read|journal|book|write/i, slot: 'night', len: 20 },
  { re: /pray|meditat|devotion|quran|bible|gratitude|stretch|mindful/i, slot: 'morning', len: 15 },
  { re: /walk|lunch/i, slot: 'midday', len: 30 },
];
const autoFor = name => AUTO.find(a => a.re.test(name || '')) || { slot: 'evening', len: 30 };
function slotWin(slot, dS, dE) {
  const s = SLOTS[slot];
  let a = Math.max(s.a ?? dS, dS), b = Math.min(s.b ?? dE, dE);
  if (b - a < 60) { a = dS; b = dE; }   // your day does not reach this slot
  return [a, b];
}

// ---------- state ----------
const DEF_SETTINGS = {
  onboarded: false, mode: null, terms: [],
  day: { start: '07:00', end: '23:00' }, buffer: 10,
  work: { source: 'manual', days: [0, 1, 2, 3, 4], start: '09:00', end: '17:00' },
  study: { perLevel: 1.5, block: 60 },
  classes: [], accounts: [], cals: { read: [], write: '', seen: [] }, autoSync: true,
};
const freshStudy = () => ({ topics: [], sessions: [], tasks: [], hidden: [], xp: 0 });
const freshGame = () => ({ xp: 0, freezes: 0, frozen: {}, bonus: {}, through: '', quests: { day: '', ids: [], paid: {} } });
const freshData = () => ({ settings: clone(DEF_SETTINGS), goals: { list: [] }, log: { days: {} }, synced: { items: {} }, study: freshStudy(), game: freshGame(), moves: {}, updatedAt: 0 });
const S = SP.S = {
  boot: 'loading',            // loading | config | signin | ready
  view: 'home', step: 0, sheet: null, draft: null, authMsg: '',
  ...freshData(),
  weekStart: thisWeek(), selDay: todayK(),
  cals: {}, calErr: {}, ev: {}, deadlines: [], dlAt: 0, dataState: 'idle',
  sync: { state: 'idle' },
};
const A = SP.A = { primary: null, extra: [] };   // { sub, email, name, picture, token, exp }
let notify = () => {};
SP.onChange = fn => { notify = fn; };
let toastFn = () => {};
SP.onToast = fn => { toastFn = fn; };

// ---------- Google sign-in (full-page redirect: works in Safari and home-screen apps) ----------
const live = a => !!a && !!a.token && Date.now() < a.exp - 60000;
const accounts = () => [A.primary, ...A.extra].filter(Boolean);
const acctBy = sub => (!sub || sub === A.primary?.sub) ? A.primary : A.extra.find(x => x.sub === sub);
const saveAccts = () => ls.set('accts', A.primary ? { primary: A.primary, extra: A.extra } : null);
function goAuth({ slot, prompt, hint }) {
  if (DEMO) return SP.demoAuth(slot);
  const state = rid() + rid();
  ss.set('oauth', { state, slot, silent: prompt === 'none', hint });
  ss.set('ui', { view: S.view, step: S.step });
  const p = new URLSearchParams({ client_id: CLIENT_ID, redirect_uri: REDIRECT, response_type: 'token', scope: (slot === 'primary' ? SCOPE_MAIN : SCOPE_EXTRA).join(' '), state });
  if (prompt) p.set('prompt', prompt);
  if (hint) p.set('login_hint', hint);
  location.assign('https://accounts.google.com/o/oauth2/v2/auth?' + p);
}
SP.signIn = () => goAuth({ slot: 'primary', prompt: A.primary ? undefined : 'select_account', hint: A.primary?.email });
SP.addAccount = () => goAuth({ slot: 'extra', prompt: 'select_account' });
SP.reconnect = sub => { const a = acctBy(sub); goAuth({ slot: a === A.primary ? 'primary' : 'extra', hint: a?.email }); };
const silentKey = email => 'silent:' + email;
// Renews an expired sign-in without a tap. Returns true if the page is about to leave.
function maybeRenew() {
  if (DEMO || !CLIENT_ID || S.sheet || navigator.onLine === false) return false;
  const a = accounts().find(x => !live(x) && Date.now() - (ss.get(silentKey(x.email)) || 0) > 10 * 60000);
  if (!a) return false;
  ss.set(silentKey(a.email), Date.now());   // one attempt, so a refusal cannot loop
  goAuth({ slot: a === A.primary ? 'primary' : 'extra', prompt: 'none', hint: a.email });
  return true;
}
async function handleAuthReturn() {
  if (!/(^|[#&])state=/.test(location.hash)) return;
  const h = new URLSearchParams(location.hash.slice(1));
  history.replaceState(null, '', location.pathname + location.search);
  const o = ss.get('oauth'); ss.set('oauth', null);
  if (!o || h.get('state') !== o.state) return;
  if (h.get('error')) {
    if (!o.silent) S.authMsg = h.get('error') === 'access_denied' ? 'Google sign-in was cancelled.' : `Google sign-in did not finish (${h.get('error')}).`;
    return;
  }
  const token = h.get('access_token'), exp = Date.now() + (+h.get('expires_in') || 3600) * 1000;
  const granted = (h.get('scope') || '').split(/\s+/), has = s => granted.includes(s);
  const canRead = has(SC.events) || has(SC.eventsRO) || has(SC.calendar);
  if (o.slot === 'primary' ? !(has(SC.events) || has(SC.calendar)) || !has(SC.list) || !has(SC.drive) : !canRead || !has(SC.list)) {
    S.authMsg = 'Sprout needs every permission on the Google screen to work. Sign in again and leave all the boxes ticked.';
    return;
  }
  let who;
  try {
    const r = await fetch(`${API}/oauth2/v3/userinfo`, { headers: { Authorization: `Bearer ${token}` } });
    if (!r.ok) throw 0;
    who = await r.json();
  } catch { S.authMsg = 'Could not confirm your Google account. Check your connection and try again.'; return; }
  const acct = { sub: who.sub, email: who.email, name: who.name, picture: who.picture, token, exp };
  ss.set(silentKey(acct.email), null);
  if (o.slot === 'primary') {
    if (A.primary && A.primary.sub !== acct.sub) { A.extra = []; }
    A.primary = acct;
  } else if (A.primary && acct.sub === A.primary.sub) {
    S.authMsg = 'That is the account you are already signed in with. Pick a different one to add.';
  } else if (A.primary) {
    A.extra = [...A.extra.filter(x => x.sub !== acct.sub), acct];
    S.pendingAccount = acct;
  }
  saveAccts();
}
SP.signOut = () => {
  ls.set('accts', null); A.primary = null; A.extra = [];
  Object.assign(S, freshData(), { boot: 'signin', view: 'home', step: 0, sheet: null, draft: null, cals: {}, ev: {}, sync: { state: 'idle' }, authMsg: '' });
  notify();
};
SP.removeAccount = sub => {
  A.extra = A.extra.filter(x => x.sub !== sub); saveAccts();
  const c = S.settings.cals, mine = k => k.startsWith(sub + '|');
  S.settings.accounts = S.settings.accounts.filter(x => x.sub !== sub);
  c.read = c.read.filter(k => !mine(k)); c.seen = c.seen.filter(k => !mine(k));
  delete S.cals[sub];
  changed({ reload: true });
};

// One wrapper for every Google API call.
async function g(method, url, { acct, query, body, raw, retry = 0 } = {}) {
  const a = acctBy(acct);
  if (!live(a)) throw { code: 'auth', acct: a?.sub };
  if (DEMO) return SP.demo(method, url, { query, body, raw, acct: a });
  const u = new URL(url.startsWith('http') ? url : API + url);
  if (query) for (const [k, v] of Object.entries(query)) if (v != null) u.searchParams.set(k, v);
  const headers = { Authorization: `Bearer ${a.token}` };
  if (raw?.headers) Object.assign(headers, raw.headers);
  else if (body !== undefined) headers['Content-Type'] = 'application/json';
  let res;
  try { res = await fetch(u, { method, headers, body: raw ? raw.body : body !== undefined ? JSON.stringify(body) : undefined }); }
  catch { throw { code: 'offline', message: 'You seem to be offline.' }; }
  if (res.ok) {
    if (res.status === 204) return null;
    return (res.headers.get('content-type') || '').includes('json') ? res.json() : res.text();
  }
  const text = await res.text();
  let msg = text; try { msg = JSON.parse(text).error?.message || text; } catch {}
  if (res.status === 401) { a.exp = 0; saveAccts(); throw { code: 'auth', acct: a.sub, message: msg }; }
  const throttled = res.status === 429 || res.status >= 500 || (res.status === 403 && /rate|quota|limit/i.test(msg));
  if (throttled && retry < 4) { await sleep(700 * 2 ** retry + Math.random() * 500); return g(method, url, { acct, query, body, raw, retry: retry + 1 }); }
  throw { code: res.status === 404 || res.status === 410 ? 'gone' : res.status === 403 ? 'forbidden' : throttled ? 'busy' : 'http', status: res.status, message: msg };
}

// ---------- your data: on this device, and in a private app folder in Google Drive ----------
const D = { fileId: null };
const dataSnapshot = () => ({ v: 4, settings: S.settings, goals: S.goals, log: S.log, synced: S.synced, study: S.study, game: S.game, moves: S.moves, updatedAt: S.updatedAt });
function applyData(d) {
  if (!d) return;
  S.settings = deepMerge(clone(DEF_SETTINGS), d.settings || {});
  S.goals = deepMerge({ list: [] }, d.goals || {});
  S.log = deepMerge({ days: {} }, d.log || {});
  S.synced = deepMerge({ items: {} }, d.synced || {});
  S.study = deepMerge(freshStudy(), d.study || {});
  S.game = deepMerge(freshGame(), d.game || {});
  S.moves = d.moves && typeof d.moves === 'object' ? d.moves : {};
  if (S.study.xp) { S.game.xp += S.study.xp; S.study.xp = 0; }   // XP used to be study-only
  S.updatedAt = d.updatedAt || 0;
}
const cacheLocal = () => { if (A.primary) ls.set('data:' + A.primary.sub, dataSnapshot()); };
const findFile = async () => (await g('GET', '/drive/v3/files', { query: { spaces: 'appDataFolder', q: `name='${DATA_FILE}'`, fields: 'files(id)', pageSize: 1 } })).files?.[0];
const readFile = async id => { const r = await g('GET', `/drive/v3/files/${id}`, { query: { alt: 'media' } }); return typeof r === 'string' ? JSON.parse(r) : r; };
async function loadRemoteData() {
  try {
    const f = await findFile();
    if (f) {
      D.fileId = f.id;
      const data = await readFile(f.id);
      if ((data.updatedAt || 0) >= (S.updatedAt || 0)) { applyData(data); cacheLocal(); }
      else uploader.dirty = true;   // this device has newer changes
    } else if (S.updatedAt) uploader.dirty = true;
    S.dataState = 'ok';
  } catch (e) { S.dataState = e.code === 'auth' ? 'idle' : 'error'; }
}
const uploader = { busy: false, dirty: false, timer: null };
// Every change saves on this device right away and to Drive a moment later.
function save() {
  S.updatedAt = Date.now();
  cacheLocal();
  uploader.dirty = true;
  clearTimeout(uploader.timer);
  uploader.timer = setTimeout(flushUpload, 1500);
}
async function flushUpload() {
  if (uploader.busy || !uploader.dirty || !live(A.primary)) return;
  uploader.busy = true;
  try {
    while (uploader.dirty) {
      uploader.dirty = false;
      const body = JSON.stringify(dataSnapshot());
      if (D.fileId) {
        await g('PATCH', `/upload/drive/v3/files/${D.fileId}`, { query: { uploadType: 'media' }, raw: { body, headers: { 'Content-Type': 'application/json' } } });
      } else {
        const b = 'sprout' + rid();
        const meta = { name: DATA_FILE, parents: ['appDataFolder'], mimeType: 'application/json' };
        const mp = `--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: application/json\r\n\r\n${body}\r\n--${b}--`;
        D.fileId = (await g('POST', '/upload/drive/v3/files', { query: { uploadType: 'multipart', fields: 'id' }, raw: { body: mp, headers: { 'Content-Type': `multipart/related; boundary=${b}` } } })).id;
      }
    }
    S.dataState = 'ok';
  } catch (e) {
    uploader.dirty = true; S.dataState = 'error';
    if (e.code !== 'auth') setTimeout(flushUpload, 30000);
  }
  uploader.busy = false;
}
// Picks up changes made on your other devices.
async function checkRemote() {
  if (!live(A.primary) || uploader.dirty || uploader.busy || S.sheet) return;
  try {
    const f = await findFile(); if (!f) return;
    const d = await readFile(f.id);
    if ((d.updatedAt || 0) > (S.updatedAt || 0) && !uploader.dirty) { D.fileId = f.id; applyData(d); cacheLocal(); notify(); }
  } catch {}
}

// ---------- terms & goals ----------
function termType(k) {
  const s = S.settings;
  if (s.mode === 'student') return 'school';
  if (s.mode === 'work') return 'work';
  const t = (s.terms || []).find(t => t.start && t.end && k >= t.start && k <= t.end);
  return t ? t.type : 'break';
}
const termLabel = t => ({ school: 'School', work: 'Work', break: 'Break' }[t]);
const currentTerm = () => (S.settings.terms || []).find(t => t.start && t.end && todayK() >= t.start && todayK() <= t.end);
// The standard four-month term a date falls in (Jan–Apr, May–Aug, Sep–Dec).
function stdTerm(d) {
  const y = d.getFullYear(), i = Math.floor(d.getMonth() / 4);
  return { start: `${y}-${pad(i * 4 + 1)}-01`, end: dk(new Date(y, i * 4 + 4, 0)), label: `${['Winter', 'Summer', 'Fall'][i]} ${y}` };
}
function nextTerms(n) {
  const out = []; let d = new Date();
  for (let i = 0; i < n; i++) { const t = stdTerm(d); out.push(t); d = addDays(parseDk(t.end), 1); }
  return out;
}
function goalOn(goal, day) {
  if (goal.start && day.k < goal.start) return false;
  if (goal.end && day.k > goal.end) return false;
  if (goal.days?.length && !goal.days.includes(day.wd)) return false;
  if (S.settings.mode === 'both' && goal.during && goal.during !== 'all' && goal.during !== day.term) return false;
  return true;
}
const goalLen = goal => +goal.minutes > 0 ? +goal.minutes : autoFor(goal.name).len;
// Where in the day a goal may go. Exact times you set are firm; a time of day is a preference.
function goalWindow(goal, dS, dE) {
  const a = toMin(goal.after), b = toMin(goal.before), len = goalLen(goal);
  if (goal.slot === 'custom' || (!goal.slot && (a != null || b != null))) return { strict: true, ws: a ?? dS, we: b ?? dE, len };
  const [ws, we] = slotWin(SLOTS[goal.slot] ? goal.slot : autoFor(goal.name).slot, dS, dE);
  return { strict: false, ws, we, len };
}
const sameDays = (a, b) => a.length === b.length && b.every(d => a.includes(d));
const DAYSETS = SP.DAYSETS = { daily: [], weekdays: [0, 1, 2, 3, 4], weekends: [5, 6], x3: [0, 2, 4] };
const daysMode = days => !days?.length || days.length === 7 ? 'daily' : Object.keys(DAYSETS).find(k => k !== 'daily' && sameDays(days, DAYSETS[k])) || 'custom';
function goalSummary(goal) {
  const a = toMin(goal.after), b = toMin(goal.before);
  let when;
  if (goal.slot === 'custom' || (!goal.slot && (a != null || b != null))) when = a != null && b != null ? `${fmt(a)}–${fmt(b)}` : a != null ? `after ${fmt(a)}` : b != null ? `before ${fmt(b)}` : 'any time';
  else when = SLOTS[goal.slot] ? SLOTS[goal.slot].label.toLowerCase() : 'best free time';
  const days = { daily: 'every day', weekdays: 'weekdays', weekends: 'weekends', x3: 'Mon, Wed, Fri' }[daysMode(goal.days)] || goal.days.map(d => WD[d]).join(', ');
  return { len: durTxt(goalLen(goal)), when, days, until: goal.end ? `until ${niceDate(goal.end)}` : '' };
}

// ---------- study confidence ----------
// How confident you have rated a course lately (1-5), or null if you have not rated it yet.
function courseConf(id) {
  const r = S.study.sessions.filter(x => x.course === id && x.rate).slice(-6).map(x => x.rate);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : null;
}
// Days until the nearest unfinished deadline for a course (assignments you added, or found in your calendar).
function coursePressure(id) {
  const now = +parseDk(todayK()), days = [];
  for (const t of S.study.tasks) if (!t.done && t.course === id && t.due) days.push(Math.round((+parseDk(t.due) - now) / 864e5));
  for (const d of S.deadlines) if (d.course === id && !S.study.hidden.includes(d.id)) days.push(Math.floor((d.due - now) / 864e5));
  const up = days.filter(d => d >= 0);
  return up.length ? Math.min(...up) : null;
}
// Shaky courses and ones with a deadline close get more weekly study time; solid ones get less.
function studyFactor(c, ws) {
  const conf = courseConf(c.id), press = coursePressure(c.id);
  let f = conf == null ? 1 : conf < 1.75 ? 1.4 : conf < 2.6 ? 1.2 : conf < 3.6 ? 1 : conf < 4.4 ? 0.85 : 0.7;
  if (press != null && press <= 7 && (!ws || dk(ws) === dk(thisWeek()))) f = Math.max(f, 1) + (press <= 3 ? 0.25 : 0.1);
  return f;
}

// ---------- calendars ----------
const enc = encodeURIComponent;
const calKey = (sub, id) => `${sub}|${id}`;
const splitKey = key => { const i = key.indexOf('|'); return [key.slice(0, i), key.slice(i + 1)]; };
const readKeys = () => (S.settings.cals.read || []).filter(k => acctBy(splitKey(k)[0]));
const calInfo = key => { const [sub, id] = splitKey(key); return (S.cals[sub] || []).find(c => c.id === id); };
const calName = key => calInfo(key)?.name || splitKey(key)[1];
const canWrite = c => !!c && (c.role === 'owner' || c.role === 'writer');
const autoSkip = id => /#holiday@|#contacts@|#weather@|@import\.calendar/.test(id);
async function loadCalendars() {
  await Promise.all(accounts().filter(live).map(async a => {
    try {
      const r = await g('GET', '/calendar/v3/users/me/calendarList', { acct: a.sub, query: { maxResults: 250 } });
      S.cals[a.sub] = (r.items || []).filter(c => !/@resource\.calendar\.google\.com$/.test(c.id))
        .map(c => ({ id: c.id, name: c.summaryOverride || c.summary || c.id, role: c.accessRole, primary: !!c.primary, selected: c.selected !== false, color: c.backgroundColor }))
        .sort((x, y) => y.primary - x.primary);
      delete S.calErr[a.sub];
    } catch (e) { S.calErr[a.sub] = e; }
  }));
  if (A.primary) ls.set('cals:' + A.primary.sub, S.cals);
  if (defaultCals()) save();
}
// Turns on sensible calendars the first time each one is seen. Returns true if anything changed.
function defaultCals() {
  const c = S.settings.cals; let did = false;
  for (const a of accounts()) for (const cal of S.cals[a.sub] || []) {
    const key = calKey(a.sub, cal.id);
    if (c.seen.includes(key)) continue;
    c.seen.push(key); did = true;
    if (cal.selected && !autoSkip(cal.id)) c.read.push(key);
  }
  const w = calInfo(c.write || '');
  if ((!c.write || (S.cals[A.primary?.sub] && !canWrite(w))) && A.primary) {
    const p = (S.cals[A.primary.sub] || []).find(x => x.primary && canWrite(x)) || (S.cals[A.primary.sub] || []).find(canWrite);
    if (p && c.write !== calKey(A.primary.sub, p.id)) { c.write = calKey(A.primary.sub, p.id); did = true; }
  }
  return did;
}
const syncedIds = () => new Set(Object.values(S.synced.items || {}).map(v => v.id).filter(Boolean));
function norm(items, ids = syncedIds()) {
  return (items || [])
    .filter(e => e.status !== 'cancelled' && e.start?.dateTime && e.end?.dateTime && e.transparency !== 'transparent')
    .filter(e => !(e.attendees || []).some(a => a.self && a.responseStatus === 'declined'))
    .map(e => {
      const p = e.extendedProperties?.private || {};
      return { id: e.id, title: e.summary || 'Busy', s: +new Date(e.start.dateTime), e: +new Date(e.end.dateTime), recurring: !!e.recurringEventId, mine: p.sproutApp === '1' || ids.has(e.id), key: p.sproutKey || null };
    });
}
async function listRange(key, tMin, tMax, own) {
  const [sub, id] = splitKey(key), out = []; let pageToken, pages = 0;
  do {
    const query = { timeMin: new Date(tMin).toISOString(), timeMax: new Date(tMax).toISOString(), singleEvents: 'true', orderBy: 'startTime', maxResults: 250, pageToken };
    if (own) query.privateExtendedProperty = 'sproutApp=1';
    const r = await g('GET', `/calendar/v3/calendars/${enc(id)}/events`, { acct: sub, query });
    out.push(...(r.items || [])); pageToken = r.nextPageToken; pages++;
  } while (pageToken && pages < 6);
  return out;
}
// Reads one week of busy time. A calendar that fails keeps its last known events and never blocks the rest.
async function loadWeek(ws) {
  const wk = dk(ws), slot = S.ev[wk] || (S.ev[wk] = {}), t0 = +ws, t1 = +addDays(ws, 7), ids = syncedIds();
  await Promise.all(readKeys().map(async key => {
    const prev = slot[key];
    if (!live(acctBy(splitKey(key)[0]))) { slot[key] = { items: prev?.items || [], at: prev?.at, err: 'auth' }; return; }
    try { slot[key] = { items: norm(await listRange(key, t0, t1), ids), at: Date.now() }; }
    catch (e) { slot[key] = { items: prev?.items || [], at: prev?.at, err: e.code || 'http', msg: e.message }; }
  }));
  for (const k of Object.keys(slot)) if (!readKeys().includes(k)) delete slot[k];
  return slot;
}
function cacheEvents() {
  if (!A.primary) return;
  const keep = {}, wk = dk(thisWeek());
  for (const k of [wk, dk(addDays(thisWeek(), 7)), dk(S.weekStart)]) if (S.ev[k]) keep[k] = S.ev[k];
  ls.set('ev:' + A.primary.sub, keep);
}
let refreshing = null;
function refreshEvents() {
  if (!A.primary) return Promise.resolve();
  if (refreshing) return refreshing;
  refreshing = (async () => {
    for (const wk of new Set([dk(thisWeek()), dk(S.weekStart)])) await loadWeek(parseDk(wk));
    cacheEvents(); recordPlans(); notify();
  })().finally(() => { refreshing = null; });
  return refreshing;
}
const eventsFor = ws => { const slot = S.ev[dk(ws)]; return slot ? readKeys().flatMap(c => slot[c]?.items || []) : []; };
const eventsReady = ws => { const slot = S.ev[dk(ws)]; return !!slot && readKeys().every(c => slot[c]); };
// Calendars that could not be read right now, with why.
function calProblems() {
  const slot = S.ev[dk(thisWeek())] || {};
  return readKeys().filter(k => slot[k]?.err).map(k => ({ key: k, err: slot[k].err, sub: splitKey(k)[0] }));
}

// ---------- deadlines found in your calendar ----------
const DL_RE = /\b(due|deadline|assignment|assn|homework|hw|exam|midterm|quiz|test|essay|lab report|problem set|pset)\b/i;
async function loadDeadlines(force) {
  if (!A.primary || (!force && Date.now() - S.dlAt < 20 * 60000)) return;
  const t0 = +parseDk(todayK()), t1 = +addDays(new Date(), 42), out = [], seen = new Set();
  // Only your main account: a work calendar is full of "test" and "due" meetings that are not coursework.
  await Promise.all(readKeys().filter(k => splitKey(k)[0] === A.primary.sub && live(A.primary)).map(async key => {
    try {
      for (const e of await listRange(key, t0, t1)) {
        if (e.status === 'cancelled' || !DL_RE.test(e.summary || '') || e.extendedProperties?.private?.sproutApp || seen.has(e.id)) continue;
        const allDay = !e.start?.dateTime, due = allDay ? +parseDk(e.start.date) : +new Date(e.start.dateTime);
        if (due < t0) continue;
        const cls = S.settings.classes.find(c => c.match && e.summary.toLowerCase().includes(c.match.toLowerCase()));
        seen.add(e.id); out.push({ id: e.id, title: e.summary, due, allDay, course: cls?.id || null });
      }
    } catch {}
  }));
  S.deadlines = out.sort((a, b) => a.due - b.due); S.dlAt = Date.now();
  ls.set('dl:' + A.primary.sub, { at: S.dlAt, list: S.deadlines });
  notify();
}

// ---------- planner ----------
function freeIntervals(a, b, taken) {
  const t = taken.filter(x => x.e > a && x.s < b).sort((x, y) => x.s - y.s);
  const out = []; let cur = a;
  for (const x of t) { if (x.s > cur) out.push({ s: cur, e: x.s }); cur = Math.max(cur, x.e); }
  if (cur < b) out.push({ s: cur, e: b });
  return out;
}
function planWeek(ws, evts) {
  const s = S.settings;
  const dS = toMin(s.day.start) ?? 420, dE = toMin(s.day.end) ?? 1380, buf = +s.buffer || 0;
  const days = [...Array(7)].map((_, i) => { const d = addDays(ws, i); const k = dk(d); return { k, d, wd: i, term: termType(k), busy: [], classes: [], items: [], unplaced: [], studyQ: [] }; });
  const studyOn = s.mode !== 'work';
  for (const ev of evts) {
    if (ev.mine) continue;
    for (const day of days) {
      const d0 = +day.d, d1 = +addDays(day.d, 1);
      if (ev.e <= d0 || ev.s >= d1) continue;
      const sm = Math.max(0, Math.round((ev.s - d0) / 6e4)), em = Math.min(1440, Math.round((ev.e - d0) / 6e4));
      const cls = studyOn ? s.classes.find(c => c.match && ev.title.toLowerCase().includes(c.match.toLowerCase())) : null;
      day.busy.push({ s: sm, e: em, title: ev.title, kind: cls ? 'class' : 'event' });
      if (cls) day.classes.push({ id: cls.id, s: sm, e: em });
    }
  }
  for (const day of days) {
    if (day.term === 'work' && s.work.source === 'manual' && s.work.days.includes(day.wd)) {
      const a = toMin(s.work.start), b = toMin(s.work.end);
      if (a != null && b != null && b > a) day.busy.push({ s: a, e: b, title: 'Work', kind: 'work' });
    }
    day.busy.sort((x, y) => x.s - y.s);
  }
  // Study: harder classes get more hours, spread over class days first.
  const school = days.filter(d => d.term === 'school');
  if (studyOn && school.length) {
    for (const c of s.classes) {
      const total = Math.round((+c.difficulty || 3) * (+s.study.perLevel || 1.5) * 60 * Math.min(1, school.length / 5) * studyFactor(c, ws) / 15) * 15;
      if (total <= 0) continue;
      const bl = +s.study.block || 60, lens = []; let r = total;
      while (r > 0) { const l = r >= bl + 30 ? bl : r; lens.push(l); r -= l; }
      const meet = school.filter(d => d.classes.some(x => x.id === c.id));
      const rest = school.filter(d => !meet.includes(d)).sort((a, b) => (a.wd >= 5) - (b.wd >= 5) || a.wd - b.wd);
      const order = [...meet, ...rest];
      lens.forEach((l, i) => order[i % order.length].studyQ.push({ c, len: l, n: i }));
    }
  }
  const goals = S.goals.list || [], moves = S.moves || {}, byK = Object.fromEntries(days.map(d => [d.k, d]));
  for (const day of days) {
    // Something added today only goes in what is left of today, never in hours already gone.
    const floor = at => { if (!at) return 0; const d = new Date(at); return dk(d) === day.k ? Math.ceil((d.getHours() * 60 + d.getMinutes()) / 15) * 15 : 0; };
    day.cand = [
      ...goals.filter(x => goalOn(x, day)).map(x => ({ fl: floor(x.at), ...goalWindow(x, dS, dE), item: { key: `${day.k}|g|${x.id}`, kind: 'goal', ref: x.id, title: x.name, icon: x.icon || '', len: goalLen(x) } })),
      ...day.studyQ.map(q => ({ study: q, fl: floor(q.c.at), item: { key: `${day.k}|s|${q.c.id}|${q.n}`, kind: 'study', ref: q.c.id, title: `Study: ${q.c.name}`, icon: '', len: q.len } })),
    ];
    day.pins = [];
  }
  // Blocks you moved by hand leave their original day and are pinned exactly where you put them.
  for (const day of days) day.cand = day.cand.filter(c => { const m = moves[c.item.key], to = m && byK[m.day]; if (!to) return true; to.pins.push({ item: c.item, s: m.s }); return false; });
  for (const day of days) {
    const taken = day.busy.map(b => ({ s: b.s - buf, e: b.e + buf }));
    const place = (len, a, b) => {
      for (const f of freeIntervals(Math.min(dS, a), Math.max(dE, b), taken)) {
        const st = Math.ceil(Math.max(f.s, a) / 15) * 15;
        if (st + len <= Math.min(f.e, b) && st + len <= 1439) return st;
      }
      return null;
    };
    const add = (item, st) => { item.s = st; item.e = st + item.len; day.items.push(item); taken.push({ s: st - buf, e: item.e + buf }); };
    for (const p of day.pins) { p.item.moved = true; add(p.item, Math.max(0, Math.min(1439 - p.item.len, p.s))); }
    const tryGoal = x => {
      let st = place(x.len, Math.max(x.ws, x.fl), x.we);
      if (st == null && !x.strict) st = place(x.len, Math.max(dS, x.fl), dE);
      if (st == null) day.unplaced.push({ ...x.item, why: x.fl ? 'not enough of today left' : x.strict ? `no free ${durTxt(x.len)} between ${fmt(x.ws)} and ${fmt(x.we)}` : `no free ${durTxt(x.len)} left` });
      else add(x.item, st);
    };
    const gs = day.cand.filter(c => !c.study);
    gs.filter(x => x.strict).forEach(tryGoal);
    for (const c of day.cand.filter(c => c.study).sort((a, b) => b.study.c.difficulty - a.study.c.difficulty)) {
      const q = c.study, cl = day.classes.filter(x => x.id === q.c.id).sort((a, b) => a.e - b.e)[0], pref = toMin(q.c.after);
      let st = pref != null ? place(q.len, Math.max(pref, c.fl), dE) : null;   // a time you chose for this class
      if (st == null && cl) st = place(q.len, Math.max(cl.e, c.fl), dE);
      if (st == null) st = place(q.len, Math.max(dS, c.fl), dE);
      if (st == null) day.unplaced.push({ ...c.item, why: `no free ${durTxt(q.len)} left` }); else add(c.item, st);
    }
    // Longer goals first, so a short one does not take the only big gap.
    gs.filter(x => !x.strict).sort((a, b) => b.len - a.len).forEach(tryGoal);
    day.items.sort((a, b) => a.s - b.s);
  }
  return days;
}
const planFor = ws => planWeek(ws, eventsFor(ws));
// Moves one block. scope 'one' changes just this block; 'all' changes the goal or class itself from now on.
function moveItem(key, day, s, scope) {
  const [origK, kind, ref] = key.split('|'), today = todayK();
  if (scope === 'all') {
    const drop = pre => { for (const k of Object.keys(S.moves)) if (k.includes(pre) && k.slice(0, 10) >= today) delete S.moves[k]; };
    if (kind === 'g') {
      const goal = S.goals.list.find(x => x.id === ref); if (!goal) return;
      goal.slot = 'custom'; goal.after = fromMin(s); goal.before = '';
      const from = wdOf(parseDk(origK)), to = wdOf(parseDk(day));
      if (from !== to && goal.days?.length && !goal.days.includes(to)) goal.days = goal.days.map(d => d === from ? to : d).sort();
      drop(`|g|${ref}`);
    } else {
      const c = S.settings.classes.find(x => x.id === ref); if (!c) return;
      c.after = fromMin(s); drop(`|s|${ref}|`);
      if (origK !== day) S.moves[key] = { day, s };
    }
  } else S.moves[key] = { day, s };
  const cutoff = dk(addDays(new Date(), -30));
  for (const k of Object.keys(S.moves)) if (k.slice(0, 10) < cutoff) delete S.moves[k];
  changed();
}
function unmoveItem(key) { delete S.moves[key]; changed(); }

// ---------- XP, levels, streak freezes, daily quests ----------
let gameFn = () => {};
SP.onGame = fn => { gameFn = fn; };
const levelOf = xp => Math.floor((Math.sqrt(1 + 8 * Math.max(0, xp) / 100) - 1) / 2) + 1;
const levelBase = l => 100 * (l - 1) * l / 2;
function addXp(n) {
  const G = S.game, before = levelOf(G.xp);
  G.xp = Math.max(0, (G.xp || 0) + n);
  if (levelOf(G.xp) > before) gameFn('level', levelOf(G.xp));
}
// The run of days you showed up on, ending on a date. Days with nothing planned, and frozen days, do not break it.
function streakAt(end) {
  const days = S.log.days, first = Object.keys(days).sort()[0];
  let n = 0, d = new Date(end);
  for (let i = 0; first && i < 800; i++, d = addDays(d, -1)) {
    const k = dk(d); if (k < first) break;
    const v = days[k];
    if (S.game.frozen[k] || (v && v.plan?.length === 0)) continue;
    if (!kept(v)) break;
    n++;
  }
  return n;
}
// A missed day uses up a streak freeze, if you have one, so one bad day does not wipe out a long run.
function applyFreezes() {
  const G = S.game, yk = dk(addDays(new Date(), -1));
  if (G.through === yk) return;
  if (G.through && G.through < yk) {
    for (let d = addDays(parseDk(G.through), 1); dk(d) <= yk; d = addDays(d, 1)) {
      const k = dk(d), v = S.log.days[k], missed = !v || (v.plan?.length > 0 && !kept(v));
      if (missed && !G.frozen[k] && G.freezes > 0 && streakAt(addDays(d, -1)) > 0) { G.frozen[k] = 1; G.freezes--; gameFn('freeze', k); }
    }
  }
  const cutoff = dk(addDays(new Date(), -400));
  for (const m of [G.frozen, G.bonus]) for (const k of Object.keys(m)) if (k.replace(/^s/, '') < cutoff) delete m[k];
  G.through = yk; save();
}
const QUESTS = {
  all: { text: 'Finish everything on today’s plan', xp: 30, ok: c => c.n >= 2, prog: c => [c.done, c.n] },
  three: { text: 'Check off 3 things', xp: 15, ok: c => c.n >= 4, prog: c => [Math.min(3, c.done), 3] },
  first: { text: 'Check off your first block', xp: 10, ok: c => c.n >= 1, prog: c => [Math.min(1, c.done), 1] },
  early: { text: 'Check something off before noon', xp: 15, ok: c => c.n >= 1 && new Date().getHours() < 11, prog: c => [c.early ? 1 : 0, 1] },
  focus: { text: 'Focus for 45 minutes', xp: 25, ok: c => c.study, prog: c => [Math.min(45, c.focus), 45] },
  session: { text: 'Finish a focus session', xp: 15, ok: c => c.study, prog: c => [Math.min(1, c.sessions), 1] },
  explain: { text: 'Explain a topic out loud', xp: 25, ok: c => c.study, prog: c => [Math.min(1, c.explained), 1] },
};
function questCtx() {
  const t = todayK(), e = S.log.days[t], plan = e?.plan || [], done = plan.filter(p => e.done?.[p.k]), noon = +parseDk(t) + 12 * 3600e3;
  const ses = S.study.sessions.filter(x => dk(new Date(x.at)) === t);
  return { n: plan.length, done: done.length, early: done.some(p => e.done[p.k] > 1 && e.done[p.k] < noon), study: S.settings.mode !== 'work' && S.settings.classes.length > 0,
    focus: ses.reduce((a, x) => a + x.min, 0), sessions: ses.length, explained: ses.filter(x => x.kind === 'feynman').length };
}
// Three quests a day, picked once each morning from the ones that make sense for today.
function questList() {
  const G = S.game, t = todayK(), c = questCtx();
  if (G.quests.day !== t && S.settings.onboarded && eventsReady(thisWeek())) {
    let seed = [...t].reduce((a, ch) => (a * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32;
    const pool = Object.keys(QUESTS).filter(id => id !== 'all' && QUESTS[id].ok(c)).map(id => [rnd(), id]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
    const ids = [...(QUESTS.all.ok(c) ? ['all'] : []), ...pool].slice(0, 3);
    if (ids.length) G.quests = { day: t, ids, paid: {} };
  }
  if (G.quests.day !== t) return [];
  return G.quests.ids.filter(id => QUESTS[id]).map(id => { const [cur, goal] = QUESTS[id].prog(c); return { id, text: QUESTS[id].text, xp: QUESTS[id].xp, cur, goal, done: !!G.quests.paid[id] || cur >= goal }; });
}
function checkQuests() {
  const G = S.game, list = questList(); let did = false;
  for (const q of list) if (q.cur >= q.goal && q.goal > 0 && !G.quests.paid[q.id]) { G.quests.paid[q.id] = 1; addXp(q.xp); gameFn('quest', q); did = true; }
  if (list.length >= 3 && list.every(q => G.quests.paid[q.id]) && !G.quests.paid.sweep) { G.quests.paid.sweep = 1; addXp(30); gameFn('sweep'); did = true; }
  return did;
}

// ---------- history (check-offs) ----------
function recordPlans() {
  if (!S.settings.onboarded || !eventsReady(thisWeek())) return;
  applyFreezes();
  const t = todayK(); let did = false;
  for (const day of planFor(thisWeek())) {
    if (day.k > t) continue;
    const entry = S.log.days[day.k];
    if (entry?.plan && day.k < t) continue;   // past days stay as they were
    const plan = day.items.map(i => ({ k: i.key, t: i.title, kind: i.kind, ref: i.ref, m: i.len }));
    if (!entry || JSON.stringify(entry.plan) !== JSON.stringify(plan) || entry.term !== day.term) {
      S.log.days[day.k] = { plan, done: entry?.done || {}, term: day.term };
      did = true;
    }
  }
  if (did) {
    const cutoff = dk(addDays(new Date(), -400));
    for (const k of Object.keys(S.log.days)) if (k < cutoff) delete S.log.days[k];
    save();
  }
  if (checkQuests()) save();   // pay out anything finished while the app was closed or on another device
}
const complete = v => v?.plan?.length > 0 && v.plan.every(p => v.done?.[p.k]);
// A day keeps your streak if you did at least one thing on it. Finishing everything is a bonus, not a requirement.
const kept = v => v?.plan?.length > 0 && v.plan.some(p => v.done?.[p.k]);
// Returns true when that day just became fully done.
function toggleDone(dayK, key, item) {
  let e = S.log.days[dayK];
  if (!e) e = S.log.days[dayK] = { plan: [], done: {}, term: termType(dayK) };
  if (item && !e.plan.some(p => p.k === key)) e.plan.push({ k: key, t: item.title, kind: item.kind, ref: item.ref, m: item.len });
  const was = complete(e), G = S.game;
  if (e.done[key]) { delete e.done[key]; addXp(-10); } else { e.done[key] = Date.now(); addXp(10); }
  const full = !was && complete(e);
  if (full && !G.bonus[dayK]) { G.bonus[dayK] = 1; addXp(25); }   // first time this day is fully done
  if (kept(e) && dayK === todayK() && !G.bonus['s' + dayK]) {     // first check-off today: the streak just grew
    G.bonus['s' + dayK] = 1;
    const s = streakAt(new Date());
    if (s > 0 && s % 7 === 0 && G.freezes < 2) { G.freezes++; gameFn('earnfreeze', s); }
  }
  checkQuests();
  save();
  return full;
}

// ---------- stats ----------
function computeStats() {
  const days = S.log.days, t = todayK();
  const keys = Object.keys(days).sort(), first = keys[0];
  const streak = streakAt(kept(days[t]) ? new Date() : addDays(new Date(), -1));
  let longest = 0, run = 0;
  if (first) for (let d = parseDk(first); dk(d) <= t; d = addDays(d, 1)) {
    const v = days[dk(d)];
    if (S.game.frozen[dk(d)] || (v && v.plan?.length === 0)) continue;
    if (kept(v)) { run++; longest = Math.max(longest, run); } else if (dk(d) !== t) run = 0;
  }
  const goodDays = keys.filter(k => complete(days[k])).length;
  const since = dk(addDays(new Date(), -29));
  let planned = 0, done = 0, minutes = 0, checks = 0;
  const byGoal = {}, byClass = {}, byWd = [...Array(7)].map(() => ({ p: 0, d: 0 })), byTerm = {};
  for (const k of keys) {
    const v = days[k]; checks += Object.keys(v.done || {}).length;
    if (k < since) continue;
    for (const p of v.plan || []) {
      const ok = !!v.done?.[p.k];
      planned++; if (ok) { done++; minutes += p.m || 0; }
      const w = byWd[wdOf(parseDk(k))]; w.p++; if (ok) w.d++;
      const tt = byTerm[v.term || 'break'] || (byTerm[v.term || 'break'] = { p: 0, d: 0 }); tt.p++; if (ok) tt.d++;
      const bucket = p.kind === 'study' ? byClass : byGoal;
      const name = p.kind === 'study' ? (S.settings.classes.find(c => c.id === p.ref)?.name || p.t.replace(/^Study: /, '')) : (S.goals.list.find(x => x.id === p.ref)?.name || p.t);
      const b = bucket[p.ref] || (bucket[p.ref] = { name, min: 0 });
      if (ok) b.min += p.m || 0;
    }
  }
  const last14 = [...Array(14)].map((_, i) => { const k = dk(addDays(new Date(), i - 13)); const v = days[k]; const p = v?.plan?.length || 0; return { k, p, d: p ? v.plan.filter(x => v.done?.[x.k]).length : 0 }; });
  const y = days[dk(addDays(new Date(), -1))];
  const wilting = !kept(days[t]) && !!y && y.plan?.length > 0 && !kept(y) && !S.game.frozen[dk(addDays(new Date(), -1))];
  return { streak, longest, goodDays, rate: planned ? done / planned : null, minutes, checks, byGoal, byClass, byWd, byTerm, last14, wilting };
}

// ---------- filling Google Calendar ----------
const evPath = (key, id) => `/calendar/v3/calendars/${enc(splitKey(key)[1])}/events${id ? '/' + enc(id) : ''}`;
function writeTarget() {
  const key = S.settings.cals.write;
  if (!key) throw { code: 'no_write' };
  if (splitKey(key)[0] !== A.primary?.sub) throw { code: 'no_write' };
  const info = calInfo(key);
  if (S.cals[A.primary.sub] && !canWrite(info)) throw { code: 'readonly', name: calName(key) };
  return key;
}
// Works out what to add, move and remove for one week so the calendar matches the plan.
async function diffWeek(ws) {
  const cal = writeTarget(), t0 = +ws, t1 = +addDays(ws, 7), now = Date.now();
  const [slot, ownRaw] = await Promise.all([loadWeek(ws), listRange(cal, t0, t1, true)]);
  const own = norm(ownRaw).filter(e => e.s >= t0 && e.s < t1);
  const ownIds = new Set(own.map(e => e.id));
  const evts = readKeys().flatMap(k => slot[k]?.items || []).filter(e => !ownIds.has(e.id));
  const desired = {};
  for (const day of planWeek(ws, evts)) for (const it of day.items) {
    if (+parseDk(day.k) + it.e * 6e4 <= now) continue;
    desired[it.key] = { s: localIso(day.k, it.s), e: localIso(day.k, it.e), t: it.title, kind: it.kind };
  }
  const wk = dk(ws), wkEnd = dk(addDays(ws, 7)), items = S.synced.items, ops = [];
  const inWeek = k => k.slice(0, 10) >= wk && k.slice(0, 10) < wkEnd;
  // Pick up Sprout events already on the calendar (from another device, say) and clear out strays.
  const claimed = new Set();
  own.sort((x, y) => (items[y.key]?.id === y.id) - (items[x.key]?.id === x.id));   // ones we already track first
  for (const ev of own) {
    if (ev.e <= now) continue;
    const k = ev.key, known = k && items[k]?.id === ev.id;
    if (k && desired[k] && !claimed.has(k) && (known || !items[k] || !ownIds.has(items[k].id))) {
      items[k] = { id: ev.id, cal, s: msToLocalIso(ev.s), e: msToLocalIso(ev.e), t: ev.title }; claimed.add(k);
    } else if (!known) ops.push({ op: 'del', k: null, v: { id: ev.id, cal, t: ev.title } });
  }
  for (const [k, v] of Object.entries(items)) {
    if (!inWeek(k) || +new Date(v.e) <= now) continue;
    if (v.cal !== cal || !desired[k]) ops.push({ op: 'del', k, v });
  }
  for (const [k, d] of Object.entries(desired)) {
    const v = items[k];
    if (!v || v.cal !== cal || !ownIds.has(v.id)) ops.push({ op: 'new', k, d });
    else if (v.s !== d.s || v.e !== d.e || v.t !== d.t) ops.push({ op: 'upd', k, d, v });
  }
  return { ops, cal, expect: Object.keys(desired).length };
}
async function createOne(cal, k, d) {
  const r = await g('POST', evPath(cal), { body: {
    summary: d.t, colorId: d.kind === 'study' ? '9' : '10',
    description: `${MARK}. Change this in the Sprout app; edits made here may be replaced.`,
    start: { dateTime: d.s, timeZone: TZ }, end: { dateTime: d.e, timeZone: TZ },
    reminders: { useDefault: true },
    extendedProperties: { private: { sproutApp: '1', sproutKey: k } },
  } });
  if (!r?.id) throw { code: 'http', message: 'Google did not confirm the new event.' };
  S.synced.items[k] = { id: r.id, cal, s: d.s, e: d.e, t: d.t };
}
async function applyOps({ ops, cal }, tick) {
  const run = async o => {
    if (o.op === 'del') {
      if (o.v.id && splitKey(o.v.cal)[0] === A.primary.sub) { try { await g('DELETE', evPath(o.v.cal, o.v.id)); } catch (e) { if (e.code !== 'gone') throw e; } }
      if (o.k && S.synced.items[o.k]?.id === o.v.id) delete S.synced.items[o.k];
    } else if (o.op === 'upd') {
      try {
        await g('PATCH', evPath(cal, o.v.id), { body: { summary: o.d.t, start: { dateTime: o.d.s, timeZone: TZ }, end: { dateTime: o.d.e, timeZone: TZ } } });
        S.synced.items[o.k] = { ...o.v, s: o.d.s, e: o.d.e, t: o.d.t };
      } catch (e) {
        if (e.code !== 'gone') throw e;
        await createOne(cal, o.k, o.d);   // it was deleted in Google; make a fresh one
      }
    } else await createOne(cal, o.k, o.d);
    tick?.();
  };
  // Removals first so a moved block never doubles up, then the rest a few at a time.
  try {
    await pool(ops.filter(o => o.op === 'del'), 3, run);
    await pool(ops.filter(o => o.op !== 'del'), 3, run);
  } finally { cacheLocal(); }
}
function syncErrorText(e) {
  switch (e?.code) {
    case 'no_write': return 'Choose which of your calendars Sprout should add your plan to.';
    case 'readonly': return `You can only view “${e.name}”, so Sprout cannot add events to it. Choose a calendar you own.`;
    case 'auth': return 'Your Google sign-in ran out. Reconnect to keep your calendar up to date.';
    case 'offline': return 'You are offline. Your calendar will update when you are back online.';
    case 'forbidden': return `Google would not allow the change: ${e.message || 'no permission for that calendar'}`;
    case 'gone': return 'That calendar no longer exists. Choose another one to fill.';
    case 'busy': return 'Google Calendar is busy right now. Sprout will try again in a minute.';
    default: return e?.message || 'The calendar update stopped unexpectedly.';
  }
}
let syncTimer = null, syncAgain = false, syncing = false;
function scheduleSync(ms = 2500) { clearTimeout(syncTimer); syncTimer = setTimeout(() => runSync(), ms); }
// Brings this week and the next few in Google Calendar in line with the plan, then checks the result.
async function runSync({ manual = false } = {}) {
  const s = S.settings;
  if (!s.onboarded || !A.primary) return;
  if (!manual && !s.autoSync) return;
  if (syncing) { syncAgain = true; return; }
  if (!live(A.primary)) { S.sync = { ...S.sync, state: 'error', code: 'auth', msg: syncErrorText({ code: 'auth' }) }; notify(); return; }
  syncing = true;
  const prev = S.sync, res = { added: 0, moved: 0, removed: 0 };
  S.sync = { ...prev, state: 'running', done: 0, todo: 0 };
  if (manual || prev.state !== 'ok') notify();
  try {
    let expect = 0;
    for (let i = 0; i < FILL_WEEKS; i++) {
      const diff = await diffWeek(addDays(thisWeek(), 7 * i));
      expect += diff.expect;
      if (diff.ops.length) {
        S.sync.todo += diff.ops.length; notify();
        await applyOps(diff, () => { S.sync.done++; notify(); });
        for (const o of diff.ops) res[o.op === 'new' ? 'added' : o.op === 'upd' ? 'moved' : 'removed']++;
      }
    }
    // Read the calendar back and count, so "added" means it is really there.
    const cal = s.cals.write, now = Date.now();
    const found = norm(await listRange(cal, now, +addDays(thisWeek(), 7 * FILL_WEEKS), true)).filter(e => e.e > now).length;
    const total = res.added + res.moved + res.removed;
    S.sync = { state: found >= expect ? 'ok' : 'error', at: Date.now(), ...res, found, expect, cal,
      msg: found >= expect ? '' : `Sprout planned ${expect} blocks but only ${found} are on your calendar. Tap “Update now” to try again.`,
      last: total ? { at: Date.now(), ...res } : prev.last };
    if (total) { save(); cacheEvents(); recordPlans(); toastFn(`Calendar updated: ${[res.added && `${res.added} added`, res.moved && `${res.moved} moved`, res.removed && `${res.removed} removed`].filter(Boolean).join(', ')}.`); }
  } catch (e) {
    S.sync = { ...prev, state: 'error', code: e.code, msg: syncErrorText(e), done: 0, todo: 0 };
    save();
    if (['busy', 'offline'].includes(e.code)) scheduleSync(60000);
  }
  syncing = false;
  if (A.primary) ls.set('sync:' + A.primary.sub, S.sync);
  notify();
  if (syncAgain) { syncAgain = false; scheduleSync(); }
}
async function removeAll() {
  if (syncing) return;
  syncing = true; S.sync = { state: 'running', done: 0, todo: 0, removing: true }; notify();
  try {
    const cal = writeTarget(), now = Date.now(), seen = new Set();
    const list = [];
    for (const e of norm(await listRange(cal, now, +addDays(new Date(), 400), true))) { seen.add(e.id); list.push({ id: e.id, cal }); }
    for (const v of Object.values(S.synced.items)) if (v.id && !seen.has(v.id) && +new Date(v.e) > now) list.push(v);
    S.sync.todo = list.length; notify();
    await pool(list, 3, async v => {
      try { await g('DELETE', evPath(v.cal, v.id)); } catch (e) { if (e.code !== 'gone') throw e; }
      S.sync.done++; notify();
    });
    S.synced.items = {}; S.settings.autoSync = false;
    S.sync = { state: 'idle', paused: true };
    toastFn(`Removed ${list.length} Sprout event${list.length === 1 ? '' : 's'}. Calendar filling is paused.`);
  } catch (e) { S.sync = { state: 'error', code: e.code, msg: syncErrorText(e) }; }
  save(); syncing = false; notify();
}

// ---------- change + lifecycle ----------
function changed({ reload = false, sync = true } = {}) {
  save();
  if (reload) refreshEvents();
  recordPlans();
  if (checkQuests()) save();
  notify();
  if (sync) scheduleSync();
}
async function start() {
  const who = A.primary;
  applyData(ls.get('data:' + who.sub));
  S.cals = ls.get('cals:' + who.sub) || {};
  S.ev = ls.get('ev:' + who.sub) || {};
  S.deadlines = ls.get('dl:' + who.sub)?.list || [];
  const last = ls.get('sync:' + who.sub);
  if (last && last.state !== 'running') S.sync = last;
  const ui = ss.get('ui'); ss.set('ui', null);
  if (ui) { S.view = ui.view || 'home'; S.step = ui.step || 0; }
  S.boot = 'ready';
  notify();
  if (!live(who)) return;
  await loadRemoteData();
  // An account connected a moment ago: remember it so your other devices know about it too.
  if (S.pendingAccount) {
    const p = S.pendingAccount; delete S.pendingAccount;
    if (!S.settings.accounts.some(x => x.sub === p.sub)) { S.settings.accounts.push({ sub: p.sub, email: p.email }); save(); }
  }
  A.extra = A.extra.filter(x => S.settings.accounts.some(y => y.sub === x.sub)); saveAccts();
  notify();
  await loadCalendars();
  notify();
  if (uploader.dirty) flushUpload();
  await refreshEvents();
  loadDeadlines(true);
  scheduleSync(800);
}
SP.boot = async () => {
  if (!DEMO && !CLIENT_ID) { S.boot = 'config'; notify(); return; }
  const a = ls.get('accts');
  if (a) { A.primary = a.primary || null; A.extra = a.extra || []; }
  await handleAuthReturn();
  if (!A.primary) { S.boot = 'signin'; notify(); return; }
  if (maybeRenew()) return;   // leaving for Google; back in a moment
  await start();
};
setInterval(() => {
  if (S.boot !== 'ready' || document.visibilityState !== 'visible') return;
  if (maybeRenew()) return;
  if (S.settings.autoSync && S.settings.cals.write) runSync(); else refreshEvents();
}, POLL_MS);
document.addEventListener('visibilitychange', () => {
  if (S.boot !== 'ready') return;
  if (document.visibilityState !== 'visible') { if (uploader.dirty) flushUpload(); return; }
  if (maybeRenew()) return;
  checkRemote(); refreshEvents().then(() => scheduleSync(1500));
});
window.addEventListener('online', () => { if (S.boot === 'ready' && !maybeRenew()) { flushUpload(); scheduleSync(500); } });

Object.assign(SP, {
  pad, dk, parseDk, addDays, monday, toMin, fromMin, fmt, rid, WD, wdOf, durTxt, todayK, thisWeek, clone, niceDate, parseDur, ls, ss,
  live, accounts, acctBy, termType, termLabel, currentTerm, stdTerm, nextTerms, autoFor, goalLen, goalSummary, daysMode,
  calKey, splitKey, readKeys, calInfo, calName, canWrite, loadCalendars, refreshEvents, eventsFor, eventsReady, calProblems,
  moveItem, unmoveItem, kept, fromMin,
  addXp, levelOf, levelBase, streakAt, questList, checkQuests,
  courseConf, coursePressure, studyFactor, loadDeadlines, CFG,
  planFor, planWeek, recordPlans, toggleDone, complete, computeStats, runSync, scheduleSync, removeAll, changed, save, start,
});
})();
