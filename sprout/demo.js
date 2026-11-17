// A pretend Google account so Sprout can be tried without signing in. Only active at ?demo.
// It answers the same requests the real Google Calendar and Drive would, from this browser's storage.
(() => {
'use strict';
const SP = window.SP;
if (!SP?.DEMO) return;
const { ls, A, S, addDays, monday, rid } = SP;
const ME = { sub: 'demo-me', email: 'you@example.com', name: 'Sam Demo' };
const WORK = { sub: 'demo-work', email: 'sam@company.example', name: 'Sam Demo' };
const mem = ls.get('google') || { file: null, events: {} };
const keep = () => ls.set('google', mem);

const CALS = {
  [ME.sub]: [
    { id: ME.email, summary: 'Personal', accessRole: 'owner', primary: true, selected: true },
    { id: 'school@group.calendar.google.com', summary: 'School timetable', accessRole: 'owner', selected: true },
    { id: 'en.canadian#holiday@group.v.calendar.google.com', summary: 'Holidays in Canada', accessRole: 'reader', selected: true },
  ],
  [WORK.sub]: [{ id: WORK.email, summary: 'Work', accessRole: 'owner', primary: true, selected: true }],
};
// [calendar, weekday (0 = Mon), start, end, title, repeats]
const WEEKLY = [
  [ME.email, 3, '19:00', '21:00', 'Dinner with Priya'], [ME.email, 5, '11:00', '12:30', 'Groceries'],
  ...[0, 2, 4].map(d => ['school@group.calendar.google.com', d, '10:30', '11:20', 'MATH 135 Lecture', 1]),
  ...[1, 3].map(d => ['school@group.calendar.google.com', d, '13:00', '14:20', 'CS 136 Lecture', 1]),
  ['school@group.calendar.google.com', 2, '14:30', '17:20', 'CHEM 120 Lab', 1],
  ...[0, 1, 2, 3, 4].map(d => [WORK.email, d, '09:30', '09:45', 'Standup', 1]),
  [WORK.email, 1, '13:00', '13:30', '1-on-1 with manager', 1], [WORK.email, 2, '10:15', '10:45', 'Team sync', 1],
];
// Dated coursework so the Study tab has deadlines to find: [calendar, days from today, title, start, end]
const DATED = [
  ['school@group.calendar.google.com', 3, 'MATH 135 Assignment 4 due'], ['school@group.calendar.google.com', 5, 'CHEM 120 Lab report due'],
  ['school@group.calendar.google.com', 9, 'CS 136 Midterm', '19:00', '21:00'],
];
const at = (day, hm) => { const [h, m] = hm.split(':').map(Number); const d = new Date(day); d.setHours(h, m, 0, 0); return d; };
function fixedEvents(cal, tMin, tMax) {
  if (cal.startsWith('school') && S.settings.mode === 'work') return [];
  const out = [];
  for (let wk = monday(new Date(tMin)); +wk < tMax; wk = addDays(wk, 7)) {
    for (const [c, wd, s, e, title, rep] of WEEKLY) {
      if (c !== cal) continue;
      const day = addDays(wk, wd), start = at(day, s), end = at(day, e);
      out.push({ id: `fx-${title}-${+start}`, status: 'confirmed', summary: title, start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() }, ...(rep ? { recurringEventId: 'fx-' + title } : {}) });
    }
  }
  const today = new Date(); today.setHours(0, 0, 0, 0);
  for (const [c, off, title, s, e] of DATED) {
    if (c !== cal) continue;
    const day = addDays(today, off);
    out.push(s ? { id: 'dt-' + title, status: 'confirmed', summary: title, start: { dateTime: at(day, s).toISOString() }, end: { dateTime: at(day, e).toISOString() } }
      : { id: 'dt-' + title, status: 'confirmed', summary: title, start: { date: SP.dk(day) }, end: { date: SP.dk(addDays(day, 1)) } });
  }
  return out;
}
const fail = (code, message) => { throw { code, message }; };

SP.demo = async (method, url, { query = {}, body, raw, acct } = {}) => {
  await new Promise(r => setTimeout(r, 40 + Math.random() * 90));
  const path = url.replace(/^https?:\/\/[^/]+/, '');
  if (path === '/drive/v3/files') return { files: mem.file ? [{ id: 'f1' }] : [] };
  if (path.startsWith('/drive/v3/files/')) return JSON.parse(mem.file);
  if (path.startsWith('/upload/drive/v3/files')) {
    if (method === 'POST') { const part = raw.body.split('\r\n\r\n')[2]; mem.file = part.slice(0, part.lastIndexOf('\r\n--')); }
    else mem.file = raw.body;
    keep(); return { id: 'f1' };
  }
  if (path === '/calendar/v3/users/me/calendarList') return { items: CALS[acct.sub] || [] };
  const m = path.match(/^\/calendar\/v3\/calendars\/([^/]+)\/events(?:\/(.+))?$/);
  if (!m) fail('http', 'The demo does not know ' + path);
  const cal = decodeURIComponent(m[1]), id = m[2] && decodeURIComponent(m[2]);
  const info = (CALS[acct.sub] || []).find(c => c.id === cal);
  if (!info) fail('gone', 'Not Found');
  const mine = mem.events[cal] || (mem.events[cal] = []);
  if (method === 'GET') {
    const tMin = +new Date(query.timeMin), tMax = +new Date(query.timeMax);
    const ms = t => +new Date(t.dateTime || t.date + 'T00:00:00');
    const within = e => ms(e.end) > tMin && ms(e.start) < tMax;
    const created = mine.filter(within);
    const items = query.privateExtendedProperty ? created.filter(e => e.extendedProperties?.private?.sproutApp === '1') : [...fixedEvents(cal, tMin, tMax).filter(within), ...created];
    return { items: items.sort((a, b) => ms(a.start) - ms(b.start)) };
  }
  if (acct.sub !== ME.sub || info.accessRole === 'reader') fail('forbidden', 'You need to have writer access to this calendar.');
  const toUtc = t => ({ dateTime: new Date(t.dateTime).toISOString() });
  if (method === 'POST') { const ev = { id: 'ev' + rid() + rid(), status: 'confirmed', ...body, start: toUtc(body.start), end: toUtc(body.end) }; mine.push(ev); keep(); return ev; }
  const i = mine.findIndex(e => e.id === id);
  if (i < 0) fail('gone', 'Not Found');
  if (method === 'DELETE') { mine.splice(i, 1); keep(); return null; }
  Object.assign(mine[i], body, body.start ? { start: toUtc(body.start), end: toUtc(body.end) } : {}); keep(); return mine[i];
};
SP.demoAuth = async slot => {
  const exp = Date.now() + 24 * 3600e3;
  if (slot === 'primary') A.primary = { ...ME, token: 'demo', exp };
  else { A.extra = [...A.extra.filter(x => x.sub !== WORK.sub), { ...WORK, token: 'demo', exp }]; S.pendingAccount = WORK; }
  ls.set('accts', { primary: A.primary, extra: A.extra });
  await SP.start();
};
SP.demoEvents = () => mem.events;
})();
