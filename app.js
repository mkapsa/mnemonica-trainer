'use strict';

// ---------- The Mnemonica stack (Juan Tamariz). T = 10.
const STACK = '4C 2H 7D 3C 4H 6D AS 5H 9S 2S QH 3D QC 8H 6S 5S 9H KC 2D JH 3S 8S 6H TC 5D KD 2C 3H 8D 5C KS JD 8C TS KH JC 7S TH AD 4S 7H 4D AC 9C JS QD 7C QS TD 6C AH 9D'.split(' ');
const POS = Object.fromEntries(STACK.map((c, i) => [c, i + 1]));
const VS = '︎'; // force text (non-emoji) presentation
const SUITS = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_NAMES = { S: 'Spades', H: 'Hearts', D: 'Diamonds', C: 'Clubs' };
const RANK_NAMES = { A: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', T: 'Ten', J: 'Jack', Q: 'Queen', K: 'King' };
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K'];
const RANGES = { all: [1, 52], a: [1, 13], b: [14, 26], c: [27, 39], d: [40, 52] };
const MASTERED = 4;
const FAST_MS = 4000;

const rl = r => (r === 'T' ? '10' : r);
const sym = s => SUITS[s] + VS;
const isRed = c => c[1] === 'H' || c[1] === 'D';
const cardAt = n => STACK[(((n - 1) % 52) + 52) % 52];
const fullName = c => `${RANK_NAMES[c[0]]} of ${SUIT_NAMES[c[1]]}`;
const short = c => rl(c[0]) + sym(c[1]);
const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
const rangeArr = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const shuffle = arr => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const fmtSec = ms => (ms / 1000).toFixed(1) + 's';
function fmtTime(ms) {
  if (ms == null) return '—';
  const s = ms / 1000;
  if (s < 60) return s.toFixed(1) + 's';
  return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') + '.' + Math.floor((s % 1) * 10);
}

// ---------- Persistence
const KEY = 'mnemonica.v1';
const DEFAULTS = { stats: {}, notes: {}, settings: { mode: 'c2n', range: 'all', input: 'type', length: '20' }, best: {}, sessions: 0 };
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || '{}');
    return { ...DEFAULTS, ...s, settings: { ...DEFAULTS.settings, ...(s.settings || {}) }, stats: s.stats || {}, notes: s.notes || {}, best: s.best || {} };
  } catch { return JSON.parse(JSON.stringify(DEFAULTS)); }
}
let S = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} }

const boxOf = c => (S.stats[c] ? S.stats[c].box : -1);
const masteredCount = () => STACK.filter(c => boxOf(c) >= MASTERED).length;

function record(card, ok, ms) {
  const st = (S.stats[card] ||= { box: 0, seen: 0, ok: 0, ms: 0 });
  st.seen++;
  st.ms += Math.min(ms, 30000);
  if (ok) {
    st.ok++;
    if (ms < FAST_MS || st.box < 3) st.box = Math.min(5, st.box + 1);
  } else {
    st.box = Math.max(0, st.box - 2);
  }
  st.last = Date.now();
  save();
}

// ---------- App state
const $app = document.getElementById('app');
let tab = 'practice';
let view = 'tabs'; // tabs | session | summary | study
let sess = null;
let study = { pos: 1, hide: false, back: 'stack' };
let installEvt = null;
let timerInt = null;

// ---------- Session logic
function poolFor(range) {
  if (range === 'weak') {
    const scored = rangeArr(1, 52).map(p => {
      const st = S.stats[STACK[p - 1]];
      const acc = st && st.seen ? st.ok / st.seen : 0;
      const avg = st && st.seen ? st.ms / st.seen : 99999;
      return { p, k: (st ? st.box : -1) * 10 + acc * 5 - avg / 10000 };
    });
    scored.sort((a, b) => a.k - b.k);
    return scored.slice(0, 13).map(x => x.p);
  }
  const [a, b] = RANGES[range] || RANGES.all;
  return rangeArr(a, b);
}

function pickPos() {
  const pool = sess.pool;
  let cand = pool.filter(p => !sess.recent.includes(p));
  if (!cand.length) cand = pool;
  const w = cand.map(p => {
    const st = S.stats[cardAt(p)];
    const box = st ? st.box : 0;
    return (st ? 1 : 1.6) * Math.pow(6 - box, 2);
  });
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < cand.length; i++) { r -= w[i]; if (r <= 0) return cand[i]; }
  return cand[cand.length - 1];
}

function makeQ(type, p) {
  const card = cardAt(p);
  switch (type) {
    case 'c2n': return { type, p, show: card, answer: p, target: card, ask: 'Which position?' };
    case 'n2c': return { type, p, showNum: p, answer: card, target: card, ask: 'Which card?' };
    case 'next': return { type, p, show: cardAt(p - 1), answer: card, target: card, ask: 'What comes next?' };
    case 'prev': return { type, p: p, show: cardAt(p + 1), answer: card, target: card, ask: 'What comes before?' };
  }
}

function startSession(opts = {}) {
  const st = S.settings;
  const speed = !!opts.speed;
  sess = {
    speed,
    mode: speed ? 'c2n' : st.mode,
    input: speed ? 'type' : st.input,
    length: speed ? 52 : opts.pool ? opts.pool.length : +st.length,
    pool: speed ? null : opts.pool || poolFor(st.range),
    deck: speed ? shuffle(rangeArr(1, 52)) : opts.pool ? shuffle(opts.pool) : null,
    n: 0, ok: 0, streak: 0, bestStreak: 0, penalty: 0,
    results: [], recent: [],
    start: performance.now(),
  };
  view = 'session';
  nextQ();
  if (speed) {
    clearInterval(timerInt);
    timerInt = setInterval(() => {
      const el = document.getElementById('clock');
      if (el && sess) el.textContent = fmtTime(performance.now() - sess.start + sess.penalty);
    }, 100);
  }
}

function nextQ() {
  clearTimeout(sess.timer);
  if (sess.length && sess.n >= sess.length) return finish();
  const p = sess.deck ? sess.deck[sess.n] : pickPos();
  sess.recent.push(p);
  const keep = Math.min(4, (sess.pool ? sess.pool.length : 52) - 1);
  while (sess.recent.length > keep) sess.recent.shift();
  const type = sess.mode === 'mix' ? pick(['c2n', 'n2c', 'next', 'prev']) : sess.mode;
  sess.q = makeQ(type, p);
  sess.state = 'ask';
  sess.sel = { rank: null, suit: null, num: '' };
  sess.qStart = performance.now();
  render();
}

function submit(given) {
  if (sess.state !== 'ask' && sess.state !== 'reveal') return;
  const q = sess.q;
  const ms = sess.state === 'reveal' ? sess.revealMs : performance.now() - sess.qStart;
  const ok = typeof given === 'boolean' ? given : given === q.answer;
  record(q.target, ok, ms);
  sess.n++;
  if (ok) { sess.ok++; sess.streak++; sess.bestStreak = Math.max(sess.bestStreak, sess.streak); }
  else { sess.streak = 0; if (sess.speed) sess.penalty += 5000; }
  sess.results.push({ p: q.p, type: q.type, ok, ms, given });
  if (typeof given === 'boolean') return nextQ(); // flashcard: already saw the answer
  sess.given = given;
  sess.state = ok ? 'right' : 'wrong';
  render();
  if (ok) sess.timer = setTimeout(nextQ, sess.speed ? 200 : 550);
  else if (navigator.vibrate) navigator.vibrate(60);
}

function finish() {
  clearInterval(timerInt);
  const total = performance.now() - sess.start;
  sess.total = total;
  S.sessions = (S.sessions || 0) + 1;
  if (sess.speed && sess.n === 52) {
    const score = total + sess.penalty;
    sess.score = score;
    if (S.best.speed == null || score < S.best.speed) { S.best.speed = score; sess.newBest = true; }
  }
  save();
  view = 'summary';
  render();
}

function quit() {
  clearTimeout(sess && sess.timer);
  clearInterval(timerInt);
  if (sess && sess.n > 0 && !sess.speed) return finish();
  sess = null;
  view = 'tabs';
  render();
}

// ---------- Templates
const icons = {
  practice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2 4 14h7l-1 8 9-12h-7z"/></svg>',
  stack: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="3" width="13" height="17" rx="2"/><path d="M4 7v12a2 2 0 0 0 2 2h9"/></svg>',
  progress: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/></svg>',
};

function cardHTML(c, cls = '') {
  const r = rl(c[0]), s = sym(c[1]);
  return `<div class="card ${isRed(c) ? 'red' : ''} ${cls}" role="img" aria-label="${fullName(c)}"><div class="corner tl"><b>${r}</b><i>${s}</i></div><div class="pip">${s}</div><div class="corner br"><b>${r}</b><i>${s}</i></div></div>`;
}
const miniHTML = c => `<span class="mini ${isRed(c) ? 'red' : ''}">${short(c)}</span>`;

function ringHTML(m) {
  const C = 2 * Math.PI * 36, f = m / 52;
  return `<div class="ring"><svg viewBox="0 0 84 84"><circle cx="42" cy="42" r="36" fill="none" stroke="var(--panel2)" stroke-width="8"/><circle cx="42" cy="42" r="36" fill="none" stroke="var(--accent)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - f)}"/></svg><div class="v"><div><b>${m}</b><span>of 52</span></div></div></div>`;
}

function chips(key, opts) {
  const cur = String(S.settings[key]);
  return `<div class="chips">${opts.map(([v, l]) => `<button class="chip ${cur === String(v) ? 'on' : ''}" data-action="set" data-key="${key}" data-value="${v}">${l}</button>`).join('')}</div>`;
}

function tabbarHTML() {
  return `<nav class="tabbar">${[['practice', 'Practice'], ['stack', 'Stack'], ['progress', 'Progress']].map(([k, l]) => `<button class="${tab === k ? 'on' : ''}" data-action="tab" data-value="${k}">${icons[k]}${l}</button>`).join('')}</nav>`;
}

function practiceHTML() {
  const m = masteredCount();
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  let install = '';
  if (!standalone && installEvt) install = `<section class="panel install"><p class="small muted" style="flex:1">Install the app to practise offline from your home screen.</p><button class="btn primary" data-action="install">Install</button></section>`;
  else if (!standalone && ios) install = `<section class="panel"><p class="small muted">To install: tap <b>Share</b> in Safari, then <b>Add to Home Screen</b>. Works fully offline.</p></section>`;
  return `<div class="wrap">
    <header class="hero"><div><h1>Mnemonica</h1><p class="muted">${m === 52 ? 'Whole stack mastered. Keep it sharp.' : m ? `${52 - m} cards left to master` : 'Learn the Tamariz stack by heart'}</p></div>${ringHTML(m)}</header>
    <section class="panel">
      <h2>Drill</h2>
      <h3>Question</h3>${chips('mode', [['c2n', 'Card → #'], ['n2c', '# → Card'], ['next', 'Next card'], ['prev', 'Previous card'], ['mix', 'Mixed']])}
      <h3>Cards</h3>${chips('range', [['all', 'All 52'], ['a', '1–13'], ['b', '14–26'], ['c', '27–39'], ['d', '40–52'], ['weak', 'Weakest 13']])}
      <h3>Answer by</h3>${chips('input', [['type', 'Typing'], ['flip', 'Flashcard']])}
      <h3>Length</h3>${chips('length', [['10', '10'], ['20', '20'], ['52', '52'], ['0', 'Endless']])}
      <button class="btn primary big" data-action="start">Start drill</button>
    </section>
    <section class="panel row-flex">
      <div><h2>Speed run</h2><p class="muted small" style="margin-top:4px">All 52 cards in random order, card → position. Misses add 5s.</p><p style="margin-top:8px">Best: <b>${fmtTime(S.best.speed)}</b></p></div>
      <button class="btn primary" data-action="speed">Go</button>
    </section>
    ${install}
  </div>`;
}

function stackHTML() {
  const secs = ['a', 'b', 'c', 'd'];
  return `<div class="wrap">
    <header class="hero"><div><h1>The stack</h1><p class="muted">Tap a card to study it and add your own memory hook.</p></div></header>
    ${secs.map(k => {
      const [a, b] = RANGES[k];
      return `<div class="sec-h"><h3 style="margin:0">${a}–${b}</h3><button class="chip" data-action="study" data-value="${a}">Study</button></div>
      <div class="list">${rangeArr(a, b).map(p => {
        const c = cardAt(p), note = S.notes[c];
        return `<button class="lrow" data-action="study" data-value="${p}"><span class="pos">${p}</span>${miniHTML(c)}<span class="name">${fullName(c)}${note ? `<small>${esc(note)}</small>` : ''}</span><span class="dot b${Math.max(0, boxOf(c) + (boxOf(c) < 0 ? 1 : 0))}" style="${boxOf(c) < 0 ? 'opacity:.4' : ''}"></span></button>`;
      }).join('')}</div>`;
    }).join('')}
  </div>`;
}

function tileClass(c) { const b = boxOf(c); return b < 0 ? 'b0' : 'b' + Math.max(1, b); }

function progressHTML() {
  const vals = Object.values(S.stats);
  const seen = vals.reduce((a, s) => a + s.seen, 0);
  const ok = vals.reduce((a, s) => a + s.ok, 0);
  const ms = vals.reduce((a, s) => a + s.ms, 0);
  const weak = STACK.filter(c => S.stats[c] && S.stats[c].seen)
    .map(c => ({ c, acc: S.stats[c].ok / S.stats[c].seen, avg: S.stats[c].ms / S.stats[c].seen }))
    .sort((a, b) => a.acc - b.acc || b.avg - a.avg).slice(0, 6);
  return `<div class="wrap">
    <header class="hero"><div><h1>Progress</h1><p class="muted">A card is mastered after ${MASTERED} quick correct answers in a row.</p></div>${ringHTML(masteredCount())}</header>
    <div class="stats">
      <div class="stat"><b>${seen ? Math.round((ok / seen) * 100) + '%' : '—'}</b><span>Accuracy</span></div>
      <div class="stat"><b>${seen ? fmtSec(ms / seen) : '—'}</b><span>Avg answer</span></div>
      <div class="stat"><b>${seen}</b><span>Answers</span></div>
      <div class="stat"><b>${fmtTime(S.best.speed)}</b><span>Best speed run</span></div>
    </div>
    <section class="panel">
      <h2>All 52</h2>
      <div class="grid" style="margin-top:12px">${STACK.map((c, i) => `<button class="tile ${tileClass(c)}" data-action="study" data-value="${i + 1}"><small>${i + 1}</small>${rl(c[0])}${sym(c[1])}</button>`).join('')}</div>
      <div class="legend"><span><i class="dot b0"></i>New</span><span><i class="dot b1"></i>Shaky</span><span><i class="dot b3"></i>Learning</span><span><i class="dot b5"></i>Mastered</span></div>
    </section>
    ${weak.length ? `<section class="panel"><h2>Needs work</h2><div class="list" style="margin-top:12px">${weak.map(w => `<button class="lrow" data-action="study" data-value="${POS[w.c]}"><span class="pos">${POS[w.c]}</span>${miniHTML(w.c)}<span class="name">${fullName(w.c)}<small>${Math.round(w.acc * 100)}% correct · ${fmtSec(w.avg)} avg</small></span></button>`).join('')}</div></section>` : ''}
    <button class="btn danger" style="width:100%" data-action="reset">Reset progress</button>
    <p class="foot">Mnemonica stack by Juan Tamariz. Progress is stored on this device.</p>
  </div>`;
}

function slotHTML(q) {
  const st = sess.state;
  const cls = st === 'right' ? 'ok' : st === 'wrong' ? 'bad' : st === 'reveal' ? 'rev' : '';
  if (typeof q.answer === 'number') {
    if (st === 'ask') return `<div class="slot num ${sess.sel.num ? 'filled' : ''}">${sess.sel.num || '?'}</div>`;
    return `<div class="slot num ${cls}"><span><span class="hash">#</span>${q.answer}</span></div>`;
  }
  if (st === 'ask') {
    const { rank, suit } = sess.sel;
    if (!rank && !suit) return `<div class="card ghost">?</div>`;
    return `<div class="card ghost partial">${rank ? rl(rank) : '·'}<span class="${suit && (suit === 'H' || suit === 'D') ? 'red-s' : ''}">${suit ? sym(suit) : ''}</span></div>`;
  }
  return cardHTML(q.answer, cls);
}

function promptHTML(q) {
  const shown = q.showNum ? `<div class="slot num shown"><span><span class="hash">#</span>${q.showNum}</span></div>` : cardHTML(q.show);
  const slot = slotHTML(q);
  if (q.type === 'prev') return `<div class="pair">${slot}<span class="arrow">←</span>${shown}</div>`;
  if (q.type === 'next') return `<div class="pair">${shown}<span class="arrow">→</span>${slot}</div>`;
  return `<div class="pair">${shown}<span class="arrow">=</span>${slot}</div>`;
}

function feedbackHTML(q) {
  if (sess.state === 'right') return `<div class="fb" style="color:var(--ok);font-weight:700">${sess.streak >= 3 ? `${sess.streak} in a row` : 'Correct'}</div>`;
  if (sess.state !== 'wrong' && sess.state !== 'reveal') return `<div class="fb"></div>`;
  let said = '';
  if (sess.state === 'wrong') {
    said = typeof sess.given === 'number' ? `#${sess.given}` : short(sess.given);
    if (typeof sess.given === 'number' && sess.given >= 1 && sess.given <= 52) said += ` is ${short(cardAt(sess.given))}`;
    if (typeof sess.given === 'string' && POS[sess.given]) said += ` is #${POS[sess.given]}`;
  }
  const p = q.p;
  const ctx = [p - 1, p, p + 1].map(n => ((n - 1 + 52) % 52) + 1)
    .map(n => `<span class="${n === p ? 'cur' : ''}">${miniHTML(cardAt(n))}#${n}</span>`).join('');
  const note = S.notes[q.target];
  return `<div class="fb">${said ? `<span class="said">${said}</span>` : ''}<div class="ctx">${ctx}</div>${note ? `<div class="note-fb">${esc(note)}</div>` : ''}</div>`;
}

function inputHTML(q) {
  const st = sess.state;
  if (st === 'wrong') return `<div class="input"><button class="btn primary big" style="margin:0" data-action="continue">Continue</button></div>`;
  if (sess.input === 'flip') {
    if (st === 'reveal') return `<div class="input"><div class="duo"><button class="btn badb" data-action="grade" data-value="0">Missed it</button><button class="btn okb" data-action="grade" data-value="1">Got it</button></div></div>`;
    return `<div class="input"><button class="btn primary big" style="margin:0" data-action="reveal">Show answer</button></div>`;
  }
  const locked = st !== 'ask' ? 'locked' : '';
  if (typeof q.answer === 'number') {
    const k = d => `<button class="key" data-action="digit" data-value="${d}">${d}</button>`;
    return `<div class="input ${locked}"><div class="keys num">${[1, 2, 3, 4, 5, 6, 7, 8, 9].map(k).join('')}<button class="key ghost" data-action="back" aria-label="Delete">⌫</button>${k(0)}<button class="key go" data-action="enter" aria-label="Submit">✓</button></div></div>`;
  }
  const { rank, suit } = sess.sel;
  return `<div class="input ${locked}">
    <div class="keys rank">${RANKS.map(r => `<button class="key ${rank === r ? 'on' : ''}" data-action="rank" data-value="${r}">${rl(r)}</button>`).join('')}<button class="key ghost" data-action="clear" aria-label="Clear">⌫</button></div>
    <div class="keys suit">${['S', 'H', 'C', 'D'].map(s => `<button class="key ${isRed('x' + s) ? 'red' : ''} ${suit === s ? 'on' : ''}" data-action="suit" data-value="${s}" aria-label="${SUIT_NAMES[s]}">${sym(s)}</button>`).join('')}</div>
  </div>`;
}

function sessionHTML() {
  const q = sess.q;
  const pct = sess.length ? (sess.n / sess.length) * 100 : 0;
  const right = sess.speed
    ? `<span class="count" id="clock">${fmtTime(performance.now() - sess.start + sess.penalty)}</span>`
    : `<span class="count">${sess.ok}<small>/${sess.n}</small></span>`;
  return `<div class="screen">
    <header class="sbar"><button class="iconbtn" data-action="quit" aria-label="End">✕</button>${sess.length ? `<div class="prog"><div style="width:${pct}%"></div></div>` : `<div style="flex:1;color:var(--muted);font-size:13px;font-weight:600">${sess.streak ? sess.streak + ' streak' : 'Endless'}</div>`}${right}</header>
    <main class="stage"><div class="ask">${q.ask}</div>${promptHTML(q)}${feedbackHTML(q)}</main>
    ${inputHTML(q)}
  </div>`;
}

function summaryHTML() {
  const n = sess.n, ok = sess.ok;
  const avg = n ? sess.results.reduce((a, r) => a + r.ms, 0) / n : 0;
  const missed = [...new Set(sess.results.filter(r => !r.ok).map(r => r.p))].sort((a, b) => a - b);
  const slow = sess.results.filter(r => r.ok).sort((a, b) => b.ms - a.ms).slice(0, 3);
  return `<div class="screen"><main class="scroll"><div class="wrap">
    <h3 style="margin-top:0">${sess.speed ? 'Speed run' : 'Drill complete'}</h3>
    ${sess.speed && sess.score != null
      ? `<div class="big-stat">${fmtTime(sess.score)}</div>${sess.newBest ? '<p style="margin-top:8px"><span class="badge">New best</span></p>' : `<p class="muted" style="margin-top:6px">Best ${fmtTime(S.best.speed)}</p>`}`
      : `<div class="big-stat">${n ? Math.round((ok / n) * 100) : 0}%</div><p class="muted" style="margin-top:6px">${ok} of ${n} correct</p>`}
    <div class="stats">
      ${sess.speed ? `<div class="stat"><b>${ok}/${n}</b><span>Correct</span></div>` : `<div class="stat"><b>${sess.bestStreak}</b><span>Best streak</span></div>`}
      <div class="stat"><b>${fmtSec(avg)}</b><span>Avg answer</span></div>
      ${sess.speed ? `<div class="stat"><b>+${sess.penalty / 1000}s</b><span>Penalty</span></div><div class="stat"><b>${fmtTime(sess.total)}</b><span>Raw time</span></div>` : ''}
    </div>
    ${missed.length ? `<h3>Missed</h3><div class="list">${missed.map(p => `<button class="lrow" data-action="study" data-value="${p}"><span class="pos">${p}</span>${miniHTML(cardAt(p))}<span class="name">${fullName(cardAt(p))}</span></button>`).join('')}</div>` : n ? '<p style="margin-top:8px">No misses.</p>' : ''}
    ${slow.length ? `<h3>Slowest correct</h3><div class="list">${slow.map(r => `<button class="lrow" data-action="study" data-value="${r.p}"><span class="pos">${r.p}</span>${miniHTML(cardAt(r.p))}<span class="name">${fullName(cardAt(r.p))}<small>${fmtSec(r.ms)}</small></span></button>`).join('')}</div>` : ''}
    <div class="actions">
      ${missed.length ? `<button class="btn primary" data-action="retry-missed" data-value="${missed.join(',')}">Drill the ${missed.length} missed</button>` : ''}
      <button class="btn ${missed.length ? '' : 'primary'}" data-action="${sess.speed ? 'speed' : 'start'}">${sess.speed ? 'Run again' : 'New drill'}</button>
      <button class="btn" data-action="done">Done</button>
    </div>
  </div></main></div>`;
}

function studyHTML() {
  const p = study.pos, c = cardAt(p);
  return `<div class="screen">
    <header class="sbar"><button class="iconbtn" data-action="study-close" aria-label="Back">←</button><div style="flex:1"></div>
      <button class="chip ${study.hide ? 'on' : ''}" data-action="study-hide">${study.hide ? 'Hiding cards' : 'Hide cards'}</button></header>
    <main class="study" id="study">
      <div class="posnum">#${p}<small> of 52</small></div>
      <div data-action="study-peek">${cardHTML(c, study.hide && !study.peek ? 'hidden' : '')}</div>
      <div style="font-weight:700">${study.hide && !study.peek ? 'Tap the card to reveal' : fullName(c)}</div>
      <div class="ctx"><span>${miniHTML(cardAt(p - 1))}#${((p + 50) % 52) + 1}</span><span style="justify-content:center;padding:0 6px">·</span><span>${miniHTML(cardAt(p + 1))}#${(p % 52) + 1}</span></div>
      <textarea id="note" placeholder="Your memory hook for #${p} = ${short(c)} (e.g. a peg image)" maxlength="200">${esc(S.notes[c] || '')}</textarea>
    </main>
    <nav class="navbar"><button class="btn" data-action="study-step" data-value="-1">← Prev</button><span class="toggle">swipe</span><button class="btn" data-action="study-step" data-value="1">Next →</button></nav>
  </div>`;
}

// ---------- Render
function render() {
  const sc = document.querySelector('.scroll');
  const keepScroll = view === 'tabs' && sc && sc.dataset.tab === tab ? sc.scrollTop : 0;
  if (view === 'session') $app.innerHTML = sessionHTML();
  else if (view === 'summary') $app.innerHTML = summaryHTML();
  else if (view === 'study') { $app.innerHTML = studyHTML(); bindStudy(); }
  else {
    const body = tab === 'practice' ? practiceHTML() : tab === 'stack' ? stackHTML() : progressHTML();
    $app.innerHTML = `<div class="screen"><main class="scroll" data-tab="${tab}">${body}</main>${tabbarHTML()}</div>`;
    document.querySelector('.scroll').scrollTop = keepScroll;
  }
}

function bindStudy() {
  const ta = document.getElementById('note');
  let t;
  ta.addEventListener('input', () => {
    const c = cardAt(study.pos), v = ta.value.trim();
    clearTimeout(t);
    t = setTimeout(() => { if (v) S.notes[c] = v; else delete S.notes[c]; save(); }, 250);
  });
  ta.addEventListener('blur', () => {
    const c = cardAt(study.pos), v = ta.value.trim();
    if (v) S.notes[c] = v; else delete S.notes[c];
    save();
  });
  const el = document.getElementById('study');
  let x0 = null, y0 = null;
  el.addEventListener('touchstart', e => { if (e.target.tagName === 'TEXTAREA') return; x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; }, { passive: true });
  el.addEventListener('touchend', e => {
    if (x0 == null) return;
    const dx = e.changedTouches[0].clientX - x0, dy = e.changedTouches[0].clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) stepStudy(dx < 0 ? 1 : -1);
  });
}

function stepStudy(d) {
  const ta = document.getElementById('note');
  if (ta) { const c = cardAt(study.pos), v = ta.value.trim(); if (v) S.notes[c] = v; else delete S.notes[c]; save(); }
  study.pos = ((study.pos - 1 + d + 52) % 52) + 1;
  study.peek = false;
  render();
}

// ---------- Input actions
function typeDigit(d) {
  if (sess.state !== 'ask') return;
  let num = sess.sel.num + d;
  if (num === '0') num = '';
  sess.sel.num = num;
  const v = +num;
  if (num.length === 2 || v >= 6) return submit(v);
  render();
}
function chooseCard(kind, v) {
  if (sess.state !== 'ask') return;
  sess.sel[kind] = sess.sel[kind] === v ? null : v;
  if (sess.sel.rank && sess.sel.suit) return submit(sess.sel.rank + sess.sel.suit);
  render();
}

const actions = {
  tab: v => { tab = v; render(); },
  set: (v, el) => { S.settings[el.dataset.key] = v; save(); render(); },
  start: () => startSession(),
  speed: () => startSession({ speed: true }),
  'retry-missed': v => startSession({ pool: v.split(',').map(Number) }),
  done: () => { sess = null; view = 'tabs'; render(); },
  quit: () => quit(),
  digit: v => typeDigit(v),
  back: () => { if (sess.state === 'ask') { sess.sel.num = sess.sel.num.slice(0, -1); render(); } },
  enter: () => { if (sess.state === 'ask' && sess.sel.num) submit(+sess.sel.num); },
  rank: v => chooseCard('rank', v),
  suit: v => chooseCard('suit', v),
  clear: () => { if (sess.state === 'ask') { sess.sel.rank = sess.sel.suit = null; render(); } },
  continue: () => nextQ(),
  reveal: () => { sess.revealMs = performance.now() - sess.qStart; sess.state = 'reveal'; render(); },
  grade: v => submit(v === '1'),
  study: v => { study.back = view; study.pos = +v; study.peek = false; view = 'study'; render(); },
  'study-close': () => { view = study.back === 'summary' && sess ? 'summary' : 'tabs'; render(); },
  'study-step': v => stepStudy(+v),
  'study-hide': () => { study.hide = !study.hide; study.peek = false; render(); },
  'study-peek': () => { if (study.hide) { study.peek = !study.peek; render(); } },
  install: async () => { if (!installEvt) return; installEvt.prompt(); await installEvt.userChoice; installEvt = null; render(); },
  reset: () => { if (confirm('Reset all progress? Your memory hooks are kept.')) { S.stats = {}; S.best = {}; S.sessions = 0; save(); render(); } },
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (!el) return;
  const fn = actions[el.dataset.action];
  if (fn) fn(el.dataset.value, el, e);
});

document.addEventListener('keydown', e => {
  if (e.target.tagName === 'TEXTAREA' || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (view === 'study') {
    if (k === 'arrowright') stepStudy(1);
    else if (k === 'arrowleft') stepStudy(-1);
    else if (k === 'escape') actions['study-close']();
    return;
  }
  if (view !== 'session') return;
  if (k === 'escape') return quit();
  if (sess.state === 'wrong') { if (k === 'enter' || k === ' ') { e.preventDefault(); nextQ(); } return; }
  if (sess.input === 'flip') {
    if (sess.state === 'ask' && (k === ' ' || k === 'enter')) { e.preventDefault(); actions.reveal(); }
    else if (sess.state === 'reveal') { if (k === 'arrowright' || k === 'y' || k === '1') submit(true); else if (k === 'arrowleft' || k === 'n' || k === '0') submit(false); }
    return;
  }
  if (sess.state !== 'ask') return;
  if (typeof sess.q.answer === 'number') {
    if (/^[0-9]$/.test(k)) typeDigit(k);
    else if (k === 'backspace') actions.back();
    else if (k === 'enter') actions.enter();
  } else {
    const rank = { a: 'A', t: 'T', '0': 'T', '1': 'T', j: 'J', q: 'Q', k: 'K' }[k] || (/^[2-9]$/.test(k) ? k : null);
    const suit = { s: 'S', h: 'H', d: 'D', c: 'C' }[k];
    if (rank) chooseCard('rank', rank);
    else if (suit) chooseCard('suit', suit);
    else if (k === 'backspace') actions.clear();
  }
});

window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (view === 'tabs' && tab === 'practice') render(); });

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}

render();
