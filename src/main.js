import ePub from 'epubjs';
import './style.css';

const SAMPLE_TEXT = "Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, and what is the use of a book, thought Alice without pictures or conversations? So she was considering in her own mind, as well as she could, for the hot day made her feel very sleepy and stupid, whether the pleasure of making a daisy chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her. There was nothing so very remarkable in that, nor did Alice think it so very much out of the way to hear the Rabbit say to itself, oh dear, oh dear, I shall be late. When she thought it over afterwards, it occurred to her that she ought to have wondered at this, but at the time it all seemed quite natural. In another moment down went Alice after it, never once considering how in the world she was to get out again.";

const SKINS = ['monolith', 'console', 'deck'];

const DEFAULT_SETTINGS = {
  hues: { monolith: 48, console: 155, deck: 255 },
  chroma: 19, // oklch chroma x100
  wordScale: 100, // percent
  wordFont: 'inter',
  wpmStep: 25,
  shortPause: 33,
  longPause: 66,
};

const WORD_FONTS = {
  inter: "'Inter', system-ui, -apple-system, sans-serif",
  mono: "'JetBrains Mono', ui-monospace, monospace",
  serif: "Georgia, 'Times New Roman', serif",
};

const $ = (id) => document.getElementById(id);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));
const clampNum = (v, min, max) => Math.max(min, Math.min(max, v));

// ---------- persisted settings ----------

function loadSettings() {
  const s = structuredClone(DEFAULT_SETTINGS);
  try {
    const saved = JSON.parse(localStorage.getItem('txtspeed_settings'));
    if (saved && typeof saved === 'object') {
      if (saved.hues && typeof saved.hues === 'object') {
        for (const skin of SKINS) {
          const h = Number(saved.hues[skin]);
          if (Number.isFinite(h)) s.hues[skin] = clampNum(h, 0, 360);
        }
      }
      if (Number.isFinite(Number(saved.chroma))) s.chroma = clampNum(Number(saved.chroma), 5, 30);
      if (Number.isFinite(Number(saved.wordScale))) s.wordScale = clampNum(Number(saved.wordScale), 70, 140);
      if (WORD_FONTS[saved.wordFont]) s.wordFont = saved.wordFont;
      if ([10, 25, 50].includes(Number(saved.wpmStep))) s.wpmStep = Number(saved.wpmStep);
      if (Number.isFinite(Number(saved.shortPause))) s.shortPause = clampNum(Number(saved.shortPause), 0, 500);
      if (Number.isFinite(Number(saved.longPause))) s.longPause = clampNum(Number(saved.longPause), 0, 500);
    }
  } catch (e) { /* corrupted storage — fall back to defaults */ }
  return s;
}

function saveSettings() {
  try { localStorage.setItem('txtspeed_settings', JSON.stringify(settings)); } catch (e) {}
}

let settings = loadSettings();

// ---------- state ----------

const sampleWords = SAMPLE_TEXT.split(/\s+/).filter(Boolean);
const savedSkin = localStorage.getItem('txtspeed_skin');
const savedTheme = localStorage.getItem('txtspeed_theme');

const state = {
  theme: savedTheme === 'light' ? 'light' : 'dark',
  skin: SKINS.includes(savedSkin) ? savedSkin : 'monolith',
  bookTitle: 'Alice’s Adventures in Wonderland (sample)',
  chapters: [sampleWords],
  chapterTitles: ['Sample text'],
  chapterIdx: 0,
  words: sampleWords,
  currentIndex: 0,
  playing: false,
  finished: false,
  wpm: clampNum(parseInt(localStorage.getItem('txtspeed_wpm')) || 300, 100, 1000),
  adaptive: localStorage.getItem('txtspeed_adaptive') === 'true',
  elapsedMinutes: 0,
};

let avgLen = 5;
let intervalId = null;
let timeoutId = null;
let startTime = null;
let pausedBySpace = false;

const mobileQuery = window.matchMedia('(max-width: 859px)');
let isMobile = mobileQuery.matches;

// ---------- elements ----------

const els = {
  fileInput: $('fileInput'),
  chapterSelect: $('chapterSelect'),
  chapterList: $('chapterList'),
  stage: $('stage'),
  wordWrap: $('wordWrap'),
  wordPre: $('wordPre'),
  wordOrp: $('wordOrp'),
  wordPost: $('wordPost'),
  measurePre: $('measurePre'),
  measureOrp: $('measureOrp'),
  nextPreview: $('nextPreview'),
  finishedScreen: $('finishedScreen'),
  finishedTime: $('finishedTime'),
  emptyState: $('emptyState'),
  progressTopFill: $('progressTopFill'),
  scrub: $('scrub'),
  scrubFill: $('scrubFill'),
  bookTitle: $('bookTitle'),
  deckBookTitle: $('deckBookTitle'),
  contextConsole: $('contextConsole'),
  contextDeck: $('contextDeck'),
  statPct: $('statPct'),
  settingsOverlay: $('settingsOverlay'),
};

// ---------- theme ----------

function accentColor(hue) {
  return `oklch(72% ${(settings.chroma / 100).toFixed(2)} ${hue})`;
}

function applyTheme() {
  const dark = state.theme === 'dark';
  const r = document.documentElement.style;
  r.setProperty('--bg', dark ? '#0a0a0a' : '#faf9f6');
  r.setProperty('--bg-elevated', dark ? '#151513' : '#ffffff');
  r.setProperty('--border', dark ? 'rgba(255,255,255,0.10)' : 'rgba(20,20,18,0.10)');
  r.setProperty('--text', dark ? '#f3f2ee' : '#17160f');
  r.setProperty('--text-muted', dark ? 'rgba(243,242,238,0.55)' : 'rgba(23,22,15,0.55)');
  r.setProperty('--text-faint', dark ? 'rgba(243,242,238,0.30)' : 'rgba(23,22,15,0.34)');
  r.setProperty('--accent', accentColor(settings.hues[state.skin]));
  r.setProperty('--accent-text', '#0a0a0a');
  r.setProperty('--word-scale', settings.wordScale / 100);
  r.setProperty('--word-font', WORD_FONTS[settings.wordFont]);
  document.body.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0a0a0a' : '#faf9f6');
  for (const row of $$('.hue-row')) {
    row.querySelector('.swatch').style.background = accentColor(settings.hues[row.dataset.hueSkin]);
  }
}

// ---------- word rendering ----------

function currentWordParts() {
  const words = state.words;
  if (!words.length) return { pre: '', orp: '', post: '' };
  const idx = clampNum(state.currentIndex, 0, words.length - 1);
  const word = words[idx];
  const mid = word.length ? Math.floor((word.length - 1) / 2) : 0;
  return { pre: word.slice(0, mid), orp: word.slice(mid, mid + 1), post: word.slice(mid + 1) };
}

function positionWord() {
  const wrap = els.wordWrap;
  if (wrap.hidden) return;
  wrap.style.transform = 'translate(0px,-50%)';
  const stageWidth = els.stage.getBoundingClientRect().width;
  const totalWidth = wrap.getBoundingClientRect().width;
  const preWidth = els.measurePre.getBoundingClientRect().width;
  const orpWidth = els.measureOrp.getBoundingClientRect().width;
  const maxWidth = stageWidth * 0.86;
  const scale = totalWidth > maxWidth && totalWidth > 0 ? maxWidth / totalWidth : 1;
  const offsetX = preWidth + orpWidth / 2;
  wrap.style.transform = `translate(${-offsetX}px, -50%) scale(${scale})`;
}

function renderWord() {
  const hasWords = state.words.length > 0;
  const showWord = hasWords && !state.finished;
  els.wordWrap.hidden = !showWord;
  els.nextPreview.hidden = !showWord;
  els.finishedScreen.hidden = !state.finished;
  els.emptyState.hidden = hasWords;

  if (showWord) {
    const { pre, orp, post } = currentWordParts();
    els.wordPre.textContent = pre;
    els.wordOrp.textContent = orp;
    els.wordPost.textContent = post;
    els.measurePre.textContent = pre;
    els.measureOrp.textContent = orp;
    positionWord();
    els.nextPreview.textContent = state.words
      .slice(state.currentIndex + 1, state.currentIndex + 3)
      .join(' ');
  }
  if (state.finished) {
    els.finishedTime.textContent = formatEta(state.elapsedMinutes);
  }
}

// ---------- context panel ----------

let ctxSpans = [];
let ctxPageStart = -1;
let ctxActiveIdx = -1;
let ctxContainer = null;

function contextContainer() {
  if (state.skin === 'console') return els.contextConsole;
  if (state.skin === 'deck') return els.contextDeck;
  return null;
}

function renderContext(force = false) {
  const container = contextContainer();
  if (!container) return;
  const words = state.words;
  const wordsPerPage = isMobile ? 50 : 220;
  const idx = clampNum(state.currentIndex, 0, Math.max(0, words.length - 1));
  const pageStart = Math.floor(idx / wordsPerPage) * wordsPerPage;

  if (force || container !== ctxContainer || pageStart !== ctxPageStart) {
    const pageEnd = Math.min(words.length, pageStart + wordsPerPage);
    const frag = document.createDocumentFragment();
    ctxSpans = [];
    for (let i = pageStart; i < pageEnd; i++) {
      const span = document.createElement('span');
      span.textContent = words[i];
      frag.appendChild(span);
      frag.appendChild(document.createTextNode(' '));
      ctxSpans.push(span);
    }
    container.replaceChildren(frag);
    ctxContainer = container;
    ctxPageStart = pageStart;
    ctxActiveIdx = -1;
  }

  const localIdx = idx - pageStart;
  if (ctxActiveIdx !== localIdx) {
    if (ctxSpans[ctxActiveIdx]) ctxSpans[ctxActiveIdx].classList.remove('active');
    if (ctxSpans[localIdx]) ctxSpans[localIdx].classList.add('active');
    ctxActiveIdx = localIdx;
  }
}

// ---------- progress / stats / controls ----------

function formatEta(minutes) {
  if (minutes < 1) return '<1m';
  if (minutes < 60) return minutes + 'm';
  return Math.floor(minutes / 60) + 'h ' + (minutes % 60) + 'm';
}

function renderProgress() {
  const words = state.words;
  const hasWords = words.length > 0;
  const idx = clampNum(state.currentIndex, 0, Math.max(0, words.length - 1));
  const pct = hasWords ? (idx / Math.max(1, words.length - 1)) * 100 : 0;
  const remaining = Math.max(0, words.length - idx - 1);
  const eta = formatEta(state.wpm > 0 ? Math.round(remaining / state.wpm) : 0);

  els.progressTopFill.style.width = pct + '%';
  els.scrubFill.style.width = pct + '%';
  els.statPct.textContent = Math.round(pct) + '%';
  for (const el of $$('.js-eta')) el.textContent = eta;
}

function renderControls() {
  const cannotPlay = !state.words.length || state.finished;
  document.body.dataset.playing = state.playing;
  document.body.dataset.adaptive = state.adaptive;
  for (const el of $$('.js-wpm')) el.textContent = state.wpm;
  for (const el of $$('.js-play-label')) el.textContent = state.playing ? 'Stop' : 'Play';
  for (const el of $$('.js-play')) el.disabled = cannotPlay;
}

function renderChapters() {
  const multiple = state.chapterTitles.length > 1;
  els.chapterSelect.hidden = !multiple;
  els.chapterList.hidden = !multiple;

  els.chapterSelect.replaceChildren(
    ...state.chapterTitles.map((t, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = t;
      return option;
    })
  );
  els.chapterSelect.value = state.chapterIdx;

  els.chapterList.replaceChildren(
    ...state.chapterTitles.map((t, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.textContent = t;
      btn.classList.toggle('active', i === state.chapterIdx);
      btn.addEventListener('click', () => selectChapter(i));
      return btn;
    })
  );
}

function renderBookTitle() {
  els.bookTitle.textContent = state.bookTitle;
  els.deckBookTitle.textContent = state.bookTitle;
}

function renderAll() {
  renderWord();
  renderContext(true);
  renderProgress();
  renderControls();
  renderChapters();
  renderBookTitle();
}

function renderTick() {
  renderWord();
  renderContext();
  renderProgress();
}

// ---------- reading engine ----------

function computeAvgLen(words) {
  if (!words.length) return 5;
  return words.reduce((s, w) => s + (w.length < 7 ? 7 : w.length), 0) / words.length;
}

function finish() {
  stop();
  state.elapsedMinutes = startTime ? Math.round((Date.now() - startTime) / 60000) : 0;
  state.finished = true;
  renderTick();
  renderControls();
}

function start() {
  if (!state.words.length || state.finished || state.playing) return;
  startTime = Date.now();
  state.playing = true;
  renderControls();
  if (state.adaptive) {
    const nextWord = () => {
      const ni = state.currentIndex + 1;
      if (ni >= state.words.length) { finish(); return; }
      state.currentIndex = ni;
      renderTick();
      const word = state.words[ni];
      const effectiveLen = word.length < 7 ? 7 : word.length;
      const lastChar = word.slice(-1);
      let pause = 0;
      if ([',', ';', ':', '"', '!', '?'].includes(lastChar)) pause = settings.shortPause;
      else if (lastChar === '.') pause = settings.longPause;
      const time = (60000 / state.wpm) * (effectiveLen / avgLen) + pause;
      timeoutId = setTimeout(nextWord, time);
    };
    timeoutId = setTimeout(nextWord, 60000 / state.wpm);
  } else {
    intervalId = setInterval(() => {
      const ni = state.currentIndex + 1;
      if (ni >= state.words.length) { finish(); return; }
      state.currentIndex = ni;
      renderTick();
    }, 60000 / state.wpm);
  }
}

function stop() {
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  intervalId = null;
  timeoutId = null;
  if (state.playing) {
    state.playing = false;
    renderControls();
  }
}

function togglePlay() {
  state.playing ? stop() : start();
}

function restart() {
  state.currentIndex = 0;
  state.finished = false;
  renderTick();
  renderControls();
}

function setWpm(v) {
  state.wpm = clampNum(v, 100, 1000);
  try { localStorage.setItem('txtspeed_wpm', state.wpm); } catch (e) {}
  renderControls();
  renderProgress();
  if (state.playing) { stop(); start(); }
}

function toggleAdaptive() {
  state.adaptive = !state.adaptive;
  try { localStorage.setItem('txtspeed_adaptive', state.adaptive); } catch (e) {}
  renderControls();
  if (state.playing) { stop(); start(); }
}

function setSkin(skin) {
  if (!SKINS.includes(skin) || skin === state.skin) return;
  state.skin = skin;
  try { localStorage.setItem('txtspeed_skin', skin); } catch (e) {}
  document.body.dataset.skin = skin;
  applyTheme();
  renderAll();
}

function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  try { localStorage.setItem('txtspeed_theme', state.theme); } catch (e) {}
  applyTheme();
}

function selectChapter(idx) {
  stop();
  state.chapterIdx = idx;
  state.words = state.chapters[idx] || [];
  avgLen = computeAvgLen(state.words);
  state.currentIndex = 0;
  state.finished = false;
  renderAll();
}

// ---------- file loading ----------

async function loadFile(file) {
  if (!file) return;
  try {
    const isTxt = !file.name.toLowerCase().endsWith('.epub');
    let chapters = [];
    let titles = [];
    if (isTxt) {
      const text = await file.text();
      const arr = text.trim().split(/\s+/).filter((w) => w.length > 0);
      if (!arr.length) { alert('No words found in that file.'); return; }
      chapters = [arr];
      titles = ['Full text'];
    } else {
      const buf = await file.arrayBuffer();
      const book = ePub(buf);
      await book.ready;
      let n = 1;
      for (const item of book.spine.items) {
        const doc = await book.load(item.href);
        const text = doc.body ? doc.body.textContent : doc.textContent;
        const arr = text.split(/\s+/).filter((w) => w.length > 0);
        if (arr.length) { chapters.push(arr); titles.push('Chapter ' + n); n++; }
      }
      if (!chapters.length) { alert('Could not extract text from that EPUB.'); return; }
    }
    stop();
    state.chapters = chapters;
    state.chapterTitles = titles;
    state.chapterIdx = 0;
    state.words = chapters[0];
    avgLen = computeAvgLen(state.words);
    state.currentIndex = 0;
    state.finished = false;
    state.bookTitle = file.name.replace(/\.(txt|epub)$/i, '');
    renderAll();
  } catch (err) {
    console.error(err);
    alert('Error loading file: ' + err.message);
  }
}

// ---------- navigation ----------

function onWheelNav(e) {
  e.preventDefault();
  if (!state.words.length) return;
  const dir = e.deltaY > 0 ? 1 : -1;
  state.currentIndex = clampNum(state.currentIndex + dir, 0, state.words.length - 1);
  state.finished = false;
  renderTick();
  renderControls();
}

function onScrub(e) {
  if (!state.words.length) return;
  const rect = e.currentTarget.getBoundingClientRect();
  const ratio = clampNum((e.clientX - rect.left) / rect.width, 0, 1);
  state.currentIndex = Math.round(ratio * (state.words.length - 1));
  state.finished = false;
  renderTick();
  renderControls();
}

// ---------- settings UI ----------

function syncSettingsUI() {
  for (const btn of $$('#modeSeg button')) {
    btn.classList.toggle('active', btn.dataset.mode === state.theme);
  }
  for (const btn of $$('#stepSeg button')) {
    btn.classList.toggle('active', Number(btn.dataset.step) === settings.wpmStep);
  }
  $('setWordFont').value = settings.wordFont;
  $('setWordScale').value = settings.wordScale;
  $('wordScaleVal').textContent = settings.wordScale + '%';
  $('setChroma').value = settings.chroma;
  $('chromaVal').textContent = settings.chroma;
  $('setShortPause').value = settings.shortPause;
  $('setLongPause').value = settings.longPause;
  for (const row of $$('.hue-row')) {
    const hue = settings.hues[row.dataset.hueSkin];
    row.querySelector('.hue-slider').value = hue;
    row.querySelector('.hue-val').textContent = hue + '°';
  }
  applyTheme();
}

function openSettings() {
  if (state.playing) { stop(); }
  syncSettingsUI();
  els.settingsOverlay.hidden = false;
}

function closeSettings() {
  els.settingsOverlay.hidden = true;
}

function wireSettings() {
  $('settingsBtn').addEventListener('click', openSettings);
  $('settingsClose').addEventListener('click', closeSettings);
  els.settingsOverlay.addEventListener('click', (e) => {
    if (e.target === els.settingsOverlay) closeSettings();
  });

  for (const btn of $$('#modeSeg button')) {
    btn.addEventListener('click', () => {
      if (btn.dataset.mode !== state.theme) toggleTheme();
      syncSettingsUI();
    });
  }

  for (const btn of $$('#stepSeg button')) {
    btn.addEventListener('click', () => {
      settings.wpmStep = Number(btn.dataset.step);
      saveSettings();
      syncSettingsUI();
    });
  }

  $('setWordFont').addEventListener('change', (e) => {
    settings.wordFont = WORD_FONTS[e.target.value] ? e.target.value : 'inter';
    saveSettings();
    applyTheme();
    requestAnimationFrame(positionWord);
  });

  $('setWordScale').addEventListener('input', (e) => {
    settings.wordScale = clampNum(Number(e.target.value), 70, 140);
    $('wordScaleVal').textContent = settings.wordScale + '%';
    saveSettings();
    applyTheme();
    requestAnimationFrame(positionWord);
  });

  $('setChroma').addEventListener('input', (e) => {
    settings.chroma = clampNum(Number(e.target.value), 5, 30);
    $('chromaVal').textContent = settings.chroma;
    saveSettings();
    applyTheme();
  });

  $('setShortPause').addEventListener('change', (e) => {
    settings.shortPause = clampNum(Number(e.target.value) || 0, 0, 500);
    e.target.value = settings.shortPause;
    saveSettings();
  });

  $('setLongPause').addEventListener('change', (e) => {
    settings.longPause = clampNum(Number(e.target.value) || 0, 0, 500);
    e.target.value = settings.longPause;
    saveSettings();
  });

  for (const row of $$('.hue-row')) {
    row.querySelector('.hue-slider').addEventListener('input', (e) => {
      settings.hues[row.dataset.hueSkin] = clampNum(Number(e.target.value), 0, 360);
      row.querySelector('.hue-val').textContent = settings.hues[row.dataset.hueSkin] + '°';
      saveSettings();
      applyTheme();
    });
  }

  $('resetSettings').addEventListener('click', () => {
    settings = structuredClone(DEFAULT_SETTINGS);
    saveSettings();
    syncSettingsUI();
    requestAnimationFrame(positionWord);
  });
}

// ---------- wiring ----------

function wire() {
  $('openBookBtn').addEventListener('click', () => els.fileInput.click());
  els.fileInput.addEventListener('change', (e) => {
    loadFile(e.target.files[0]);
    e.target.value = '';
  });

  els.chapterSelect.addEventListener('change', (e) => selectChapter(parseInt(e.target.value)));

  for (const btn of $$('[data-skin-btn]')) {
    btn.addEventListener('click', () => setSkin(btn.dataset.skinBtn));
  }

  $('themeToggle').addEventListener('click', toggleTheme);
  $('restartBtn').addEventListener('click', restart);

  for (const el of $$('.js-play')) el.addEventListener('click', togglePlay);
  for (const el of $$('.js-wpm-inc')) el.addEventListener('click', () => setWpm(state.wpm + settings.wpmStep));
  for (const el of $$('.js-wpm-dec')) el.addEventListener('click', () => setWpm(state.wpm - settings.wpmStep));
  for (const el of $$('.js-adaptive')) el.addEventListener('click', toggleAdaptive);

  els.stage.addEventListener('wheel', onWheelNav, { passive: false });
  els.scrub.addEventListener('click', onScrub);

  window.addEventListener('resize', () => {
    const mobile = mobileQuery.matches;
    if (mobile !== isMobile) {
      isMobile = mobile;
      renderContext(true);
    }
    positionWord();
  });

  window.addEventListener('keydown', (e) => {
    if (!els.settingsOverlay.hidden) {
      if (e.code === 'Escape') closeSettings();
      return;
    }
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault();
      if (state.playing) { stop(); pausedBySpace = true; }
    }
  });

  window.addEventListener('keyup', (e) => {
    if (!els.settingsOverlay.hidden) return;
    if (e.code === 'Space' && !['INPUT', 'SELECT', 'BUTTON', 'TEXTAREA'].includes(e.target.tagName)) {
      e.preventDefault();
      if (pausedBySpace && !state.playing) { start(); pausedBySpace = false; }
    }
  });

  wireSettings();
}

// ---------- init ----------

document.body.dataset.skin = state.skin;
avgLen = computeAvgLen(state.words);
applyTheme();
wire();
renderAll();
requestAnimationFrame(positionWord);
