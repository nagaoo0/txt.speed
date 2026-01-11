import ePub from 'epubjs';
import './style.css';

let book;
let chapters = [];
let words = [];
let currentIndex = 0;
let currentPage = 0;
let intervalId;
let timeoutId;
let startTime;
let wpm = 300;
let adaptiveSpeed = false;
let avgLen = 5;
const wordsPerPage = 300;
const shortPause = 33; // ms for , ; : " ! ?
const longPause = 66; // ms for .
const isMobile = window.innerWidth < 768;
const mobileWordsPerPage = 50;

const fileInput = document.getElementById('epubFile');
const chapterSelect = document.getElementById('chapterSelect');
const wpmInput = document.getElementById('wpm');
const startStopBtn = document.getElementById('startStop');
const wordDisplay = document.getElementById('wordDisplay');
const sidebar = document.getElementById('sidebar');
const bottomPanel = document.getElementById('bottomPanel');
const adaptiveToggle = document.getElementById('adaptiveToggle');

// Load settings
wpm = parseInt(localStorage.getItem('wpm')) || 300;
adaptiveSpeed = localStorage.getItem('adaptiveSpeed') === 'true';
wpmInput.value = wpm;
adaptiveToggle.checked = adaptiveSpeed;

if (isMobile) {
  const initialContent = '<p>Select an EPUB file to begin.</p>';
  sidebar.innerHTML = '';
  bottomPanel.innerHTML = initialContent;
  bottomPanel.appendChild(fileInput);
}

fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  try {
    chapters = [];
    chapterSelect.innerHTML = '';

    if (file.type === 'text/plain') {
      // Handle TXT
      const text = await file.text();
      const chapterWords = text.split(/\s+/).filter(w => w.length > 0);
      chapters.push(chapterWords);
      chapterSelect.innerHTML = '<option value="0">Chapter 1</option>';
    } else {
      // Handle EPUB
      const arrayBuffer = await file.arrayBuffer();
      book = ePub(arrayBuffer);
      await book.ready;

      const spine = book.spine;
      let chapterNum = 1;
      for (let item of spine.items) {
        const doc = await book.load(item.href);
        const text = doc.body ? doc.body.textContent : doc.textContent;
        const chapterWords = text.split(/\s+/).filter(w => w.length > 0);
        if (chapterWords.length > 0) {
          chapters.push(chapterWords);
          const option = document.createElement('option');
          option.value = chapters.length - 1;
          option.textContent = `Chapter ${chapterNum}`;
          chapterSelect.appendChild(option);
          chapterNum++;
        }
      }
    }

    // Load first chapter
    words = chapters[0] || [];
    avgLen = words.length > 0 ? words.reduce((sum, w) => sum + (w.length < 7 ? 7 : w.length), 0) / words.length : 5;
    currentIndex = 0;
    currentPage = 0;
    displayWord();
    startStopBtn.disabled = false;
  } catch (error) {
    console.error('Error loading file:', error);
    alert('Error loading file');
  }
});

chapterSelect.addEventListener('change', () => {
  const chapter = parseInt(chapterSelect.value);
  words = chapters[chapter] || [];
  avgLen = words.length > 0 ? words.reduce((sum, w) => sum + (w.length < 7 ? 7 : w.length), 0) / words.length : 5;
  currentIndex = 0;
  currentPage = 0;
  displayWord();
});

function displayWord() {
  if (currentIndex >= words.length) {
    stop();
    const currentChapter = chapters.findIndex(ch => ch === words);
    const elapsedMinutes = startTime ? Math.round((Date.now() - startTime) / 1000 / 60) : 0;
    if (currentChapter < chapters.length - 1) {
      wordDisplay.innerHTML = `<button id="nextChapterBtn">Next Chapter</button><br>Read in ${elapsedMinutes} minutes`;
      document.getElementById('nextChapterBtn').addEventListener('click', () => {
        const nextChapter = currentChapter + 1;
        chapterSelect.value = nextChapter;
        words = chapters[nextChapter];
        currentIndex = 0;
        currentPage = 0;
        displayWord();
        startStopBtn.disabled = false;
      });
    } else {
      const hours = Math.floor(elapsedMinutes / 60);
      const mins = elapsedMinutes % 60;
      wordDisplay.innerHTML = `Finished!<br>Read in ${hours} hours and ${mins} minutes`;
    }
    wordDisplay.style.transform = 'translate(-50%, -50%)';
    const panel = isMobile ? bottomPanel : sidebar;
    panel.innerHTML = '';
    return;
  }

  const word = words[currentIndex];
  const len = word.length;
  const mid = Math.floor((len - 1) / 2);
  let html = '';
  for (let i = 0; i < len; i++) {
    if (i === mid) {
      html += `<span class="red">${word[i]}</span>`;
    } else {
      html += word[i];
    }
  }
  wordDisplay.innerHTML = html;

  // Calculate scale for fitting
  const maxWidth = window.innerWidth * 0.9;
  const currentWidth = wordDisplay.getBoundingClientRect().width;
  const scale = Math.min(1, maxWidth / currentWidth);

  // Calculate offset
  const temp = document.createElement('div');
  temp.style.fontSize = getComputedStyle(wordDisplay).fontSize;
  temp.style.fontWeight = 'bold';
  temp.style.position = 'absolute';
  temp.style.visibility = 'hidden';
  temp.style.whiteSpace = 'nowrap';
  temp.style.transform = `scale(${scale})`;
  temp.textContent = word.substring(0, mid);
  document.body.appendChild(temp);
  const width = temp.getBoundingClientRect().width;
  document.body.removeChild(temp);
  wordDisplay.style.transform = `translate(-${width}px, -50%) scale(${scale})`;

  // Update panel
  const wordsPerPageUsed = isMobile ? mobileWordsPerPage : wordsPerPage;
  const panel = isMobile ? bottomPanel : sidebar;
  currentPage = Math.floor(currentIndex / wordsPerPageUsed);
  const pageStart = currentPage * wordsPerPageUsed;
  const pageEnd = Math.min(words.length, (currentPage + 1) * wordsPerPageUsed);
  const pageWords = words.slice(pageStart, pageEnd);
  const highlighted = pageWords.map((w, i) => i + pageStart === currentIndex ? `<mark>${w}</mark>` : w).join(' ');
  panel.innerHTML = `<p>${highlighted}</p>`;
}

function start() {
  if (!words.length) return;
  startTime = Date.now();
  if (adaptiveSpeed) {
    function nextWord() {
      currentIndex++;
      displayWord();
      if (currentIndex < words.length) {
        const word = words[currentIndex];
        const len = word.length;
        const effectiveLen = len < 7 ? 7 : len;
        const lastChar = word.slice(-1);
        let pause = 0;
        if ([',', ';', ':', '"', '!', '?'].includes(lastChar)) pause = shortPause;
        else if (lastChar === '.') pause = longPause;
        const time = (60000 / wpm) * (effectiveLen / avgLen) + pause;
        timeoutId = setTimeout(nextWord, time);
      }
    }
    nextWord();
  } else {
    intervalId = setInterval(() => {
      currentIndex++;
      displayWord();
    }, 60000 / wpm);
  }
  startStopBtn.textContent = 'Stop';
}

function stop() {
  clearInterval(intervalId);
  clearTimeout(timeoutId);
  intervalId = null;
  timeoutId = null;
  startStopBtn.textContent = 'Start';
}

startStopBtn.addEventListener('click', () => {
  if (intervalId || timeoutId) {
    stop();
  } else {
    start();
  }
});

wpmInput.addEventListener('input', () => {
  wpm = parseInt(wpmInput.value) || 300;
  localStorage.setItem('wpm', wpm);
  if (intervalId || timeoutId) {
    stop();
    start();
  }
});

adaptiveToggle.addEventListener('change', () => {
  adaptiveSpeed = adaptiveToggle.checked;
  localStorage.setItem('adaptiveSpeed', adaptiveSpeed);
  if (intervalId || timeoutId) {
    stop();
    start();
  }
});

// Wheel to navigate
window.addEventListener('wheel', (e) => {
  e.preventDefault();
  if (e.deltaY > 0) {
    currentIndex = Math.min(words.length - 1, currentIndex + 1);
  } else {
    currentIndex = Math.max(0, currentIndex - 1);
  }
  displayWord();
});

// Space to pause
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (intervalId) {
      stop();
    } else {
      start();
    }
  }
});

// Initial state
startStopBtn.disabled = true;
