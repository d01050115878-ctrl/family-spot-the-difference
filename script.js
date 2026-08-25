/* =========================================================
   틀린그림찾기 - 게임 로직 (실제 그림 기반)
   ========================================================= */

/* 스테이지 번호(1~20)와 난이도(다른 곳 개수) 순서는 그대로 유지하되,
   같은 난이도 그룹 안에서는 어떤 도안이 몇 번에 배치될지 매판 랜덤으로 섞음 */
(function shuffleStagesWithinDifficultyGroups() {
  let start = 0;
  while (start < STAGES.length) {
    let end = start + 1;
    while (end < STAGES.length && STAGES[end].diffs.length === STAGES[start].diffs.length) end++;
    for (let i = end - 1; i > start; i--) {
      const j = start + Math.floor(Math.random() * (i - start + 1));
      const tmp = STAGES[i]; STAGES[i] = STAGES[j]; STAGES[j] = tmp;
    }
    start = end;
  }
})();

const TOTAL_STAGES = STAGES.length;
const MISTAKE_LIMIT = 3;

/* ---------- 유틸 ---------- */
function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
function choice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function pad2(n) { return n < 10 ? '0' + n : '' + n; }
function fmtTime(sec) {
  sec = Math.max(0, Math.ceil(sec));
  return pad2(Math.floor(sec / 60)) + ':' + pad2(sec % 60);
}

/* ---------- 사운드 ---------- */
let audioCtx = null;
let soundOn = localStorage.getItem('sgc_soundOn') !== 'off';
function ensureAudio() {
  if (!audioCtx) {
    try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audioCtx = null; }
  }
  return audioCtx;
}
function beep(freq, duration, type, delay, gain) {
  if (!soundOn) return;
  const ctx = ensureAudio();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type || 'sine';
  osc.frequency.value = freq;
  const t0 = ctx.currentTime + (delay || 0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain || 0.15, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc.connect(g); g.connect(ctx.destination);
  osc.start(t0); osc.stop(t0 + duration + 0.02);
}
function soundCorrect() { beep(880, 0.18, 'triangle', 0, 0.18); beep(1320, 0.2, 'triangle', 0.08, 0.15); }
function soundWrong() { beep(180, 0.22, 'sawtooth', 0, 0.14); }
function soundWin() { [523, 659, 784, 1046].forEach((f, i) => beep(f, 0.22, 'triangle', i * 0.1, 0.16)); }
function soundFail() { beep(220, 0.3, 'sawtooth', 0, 0.14); beep(160, 0.35, 'sawtooth', 0.15, 0.14); }
function soundHint() { beep(660, 0.15, 'sine', 0, 0.12); }
function soundClick() { beep(500, 0.08, 'sine', 0, 0.08); }

/* ---------- 저장 데이터 ---------- */
function loadStars() { try { return JSON.parse(localStorage.getItem('sgc_stageStars') || '{}'); } catch (e) { return {}; } }
function saveStars(obj) { localStorage.setItem('sgc_stageStars', JSON.stringify(obj)); }
function loadBestScores() { try { return JSON.parse(localStorage.getItem('sgc_bestScores') || '{}'); } catch (e) { return {}; } }
function saveBestScores(obj) { localStorage.setItem('sgc_bestScores', JSON.stringify(obj)); }
function loadUnlocked() { return parseInt(localStorage.getItem('sgc_unlocked') || '1', 10); }
function saveUnlocked(n) { localStorage.setItem('sgc_unlocked', String(n)); }
function getTotalScore() {
  const best = loadBestScores();
  return Object.values(best).reduce((a, b) => a + b, 0);
}

/* ---------- 상태 ---------- */
const state = {
  stage: 1,
  diffCount: 0,
  found: 0,
  mistakes: 0,
  hintsUsed: 0,
  timeLimit: 0,
  timeLeft: 0,
  timerId: null,
  active: false,
  diffs: [],
};

/* ---------- DOM ---------- */
const $ = (id) => document.getElementById(id);
const startScreen = $('startScreen');
const gameScreen = $('gameScreen');
const stageGrid = $('stageGrid');
const totalScoreVal = $('totalScoreVal');
const stageVal = $('stageVal');
const timerVal = $('timerVal');
const remainVal = $('remainVal');
const scoreVal = $('scoreVal');
const missVal = $('missVal');
const themeLabel = $('themeLabel');
const leftImg = $('leftImg');
const rightImg = $('rightImg');
const leftImgWrap = $('leftImgWrap');
const rightImgWrap = $('rightImgWrap');
const leftMarkers = $('leftMarkers');
const rightMarkers = $('rightMarkers');
const leftPanelWrap = $('leftPanelWrap');
const rightPanelWrap = $('rightPanelWrap');
const winModal = $('winModal');
const failModal = $('failModal');
const howtoModal = $('howtoModal');
const soundBtn = $('soundBtn');

function updateSoundBtn() { soundBtn.textContent = soundOn ? '🔊' : '🔇'; }
updateSoundBtn();

/* ---------- 스테이지 선택 화면 ---------- */
function renderStageGrid() {
  const stars = loadStars();
  const unlocked = loadUnlocked();
  stageGrid.innerHTML = '';
  for (let i = 1; i <= TOTAL_STAGES; i++) {
    const cfg = STAGES[i - 1];
    const btn = document.createElement('button');
    const locked = i > unlocked;
    btn.className = 'stage-btn' + (locked ? ' locked' : '');
    const st = stars[i] || 0;
    btn.innerHTML = locked
      ? `<span class="stage-num">🔒</span><span class="stage-stars"></span>`
      : `<span class="stage-emoji">${cfg.emoji}</span><span class="stage-num">${i}. ${cfg.title}</span><span class="stage-stars">${'★'.repeat(st)}${'☆'.repeat(3 - st)}</span>`;
    if (!locked) {
      btn.addEventListener('click', () => { soundClick(); startStage(i); });
    }
    stageGrid.appendChild(btn);
  }
  totalScoreVal.textContent = getTotalScore();
}
renderStageGrid();

/* ---------- 화면 전환 ---------- */
function showScreen(scr) {
  [startScreen, gameScreen].forEach((s) => s.classList.add('hidden'));
  scr.classList.remove('hidden');
}

/* ---------- 좌표 변환 (표시 크기 -> 원본 이미지 픽셀 좌표) ---------- */
function getImagePoint(imgEl, clientX, clientY, natW, natH) {
  const rect = imgEl.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return { x: -9999, y: -9999 };
  const relX = (clientX - rect.left) / rect.width;
  const relY = (clientY - rect.top) / rect.height;
  return { x: relX * natW, y: relY * natH };
}

/* ---------- 스테이지 시작 ---------- */
function startStage(n) {
  const cfg = STAGES[n - 1];
  state.stage = n;
  state.diffs = cfg.diffs.map((d, i) => ({ ...d, id: 'd' + i, found: false }));
  state.diffCount = state.diffs.length;
  state.found = 0;
  state.mistakes = 0;
  state.hintsUsed = 0;
  state.timeLimit = cfg.time;
  state.timeLeft = cfg.time;
  state.active = false;

  themeLabel.textContent = `${cfg.emoji} ${cfg.title} - 다른 곳 ${state.diffCount}개를 찾아보세요!`;
  stageVal.textContent = n;
  remainVal.textContent = state.diffCount;
  scoreVal.textContent = 0;
  missVal.textContent = `0/${MISTAKE_LIMIT}`;
  timerVal.textContent = fmtTime(state.timeLeft);

  leftImgWrap.style.aspectRatio = `${cfg.w} / ${cfg.h}`;
  rightImgWrap.style.aspectRatio = `${cfg.w} / ${cfg.h}`;
  leftMarkers.innerHTML = '';
  rightMarkers.innerHTML = '';

  let loadedCount = 0;
  const onLoaded = () => {
    loadedCount++;
    if (loadedCount >= 2) {
      state.active = true;
      stopTimer();
      state.timerId = setInterval(tick, 1000);
    }
  };
  leftImg.onload = onLoaded;
  rightImg.onload = onLoaded;
  leftImg.src = cfg.imgA;
  rightImg.src = cfg.imgB;

  showScreen(gameScreen);
}

function tick() {
  state.timeLeft -= 1;
  timerVal.textContent = fmtTime(state.timeLeft);
  if (state.timeLeft <= 0) {
    stopTimer();
    endStageFail('time');
  }
}
function stopTimer() { if (state.timerId) clearInterval(state.timerId); state.timerId = null; }

/* ---------- 클릭 처리 ---------- */
function computeCurrentScore() {
  const timeFrac = clamp(state.timeLeft / state.timeLimit, 0, 1);
  let score = 60 + Math.round(timeFrac * 100) - state.mistakes * 5 - state.hintsUsed * 15;
  score = Math.max(10, score);
  return score;
}

/* 클릭 판정용 반경: 정확한 지점이 아니어도 다른 부분 근처를 누르면 정답으로 인정 */
function hitRadius(r, cfg) {
  return Math.max(r * 2.4, Math.min(cfg.w, cfg.h) * 0.045);
}

function onPanelPointer(e, side) {
  if (!state.active) return;
  const cfg = STAGES[state.stage - 1];
  const imgEl = side === 'left' ? leftImg : rightImg;
  const pt = getImagePoint(imgEl, e.clientX, e.clientY, cfg.w, cfg.h);
  let hit = null;
  for (const d of state.diffs) {
    if (d.found) continue;
    if (Math.hypot(pt.x - d.x, pt.y - d.y) <= hitRadius(d.r, cfg)) { hit = d; break; }
  }
  if (hit) {
    markFound(hit);
  } else {
    state.mistakes++;
    soundWrong();
    addMissMarker(side === 'left' ? leftMarkers : rightMarkers, pt.x, pt.y, cfg);
    missVal.textContent = `${state.mistakes}/${MISTAKE_LIMIT}`;
    const wrap = side === 'left' ? leftPanelWrap : rightPanelWrap;
    wrap.classList.remove('shake'); void wrap.offsetWidth; wrap.classList.add('shake');
    if (state.mistakes >= MISTAKE_LIMIT) {
      stopTimer();
      state.active = false;
      setTimeout(() => endStageFail('mistakes'), 450);
    }
  }
}
leftImgWrap.addEventListener('click', (e) => onPanelPointer(e, 'left'));
rightImgWrap.addEventListener('click', (e) => onPanelPointer(e, 'right'));

/* ---------- 마커 (퍼센트 기반, 반응형) ---------- */
function pct(v, total) { return (v / total) * 100; }

function addFoundMarker(layer, d, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'marker found-marker';
  const sizePct = pct(d.r * 2.2, cfg.w);
  wrap.style.left = pct(d.x, cfg.w) + '%';
  wrap.style.top = pct(d.y, cfg.h) + '%';
  wrap.style.width = sizePct + '%';
  wrap.style.aspectRatio = '1 / 1';
  wrap.innerHTML = '<div class="ring pencil-ring"></div>';
  layer.appendChild(wrap);
}

function addHintRing(layer, d, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'marker hint-marker';
  const sizePct = pct(d.r * 2, cfg.w);
  wrap.style.left = pct(d.x, cfg.w) + '%';
  wrap.style.top = pct(d.y, cfg.h) + '%';
  wrap.style.width = sizePct + '%';
  wrap.style.aspectRatio = '1 / 1';
  wrap.innerHTML = '<div class="ring hint-ring"></div>';
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), 1550);
}

function addMissMarker(layer, x, y, cfg) {
  const wrap = document.createElement('div');
  wrap.className = 'marker miss-marker';
  const sizePct = pct(Math.min(cfg.w, cfg.h) * 0.09, cfg.w);
  wrap.style.left = pct(x, cfg.w) + '%';
  wrap.style.top = pct(y, cfg.h) + '%';
  wrap.style.width = sizePct + '%';
  wrap.style.aspectRatio = '1 / 1';
  wrap.innerHTML = '<div class="miss-x"><span></span><span></span></div>';
  layer.appendChild(wrap);
  setTimeout(() => wrap.remove(), 520);
}

function markFound(d) {
  d.found = true;
  state.found++;
  soundCorrect();
  const cfg = STAGES[state.stage - 1];
  addFoundMarker(leftMarkers, d, cfg);
  addFoundMarker(rightMarkers, d, cfg);
  remainVal.textContent = state.diffCount - state.found;
  scoreVal.textContent = computeCurrentScore();
  if (state.found >= state.diffCount) {
    stopTimer();
    state.active = false;
    setTimeout(endStageWin, 400);
  }
}

/* ---------- 힌트 ---------- */
$('hintBtn').addEventListener('click', () => {
  if (!state.active) return;
  const remaining = state.diffs.filter((d) => !d.found);
  if (remaining.length === 0) return;
  state.hintsUsed++;
  soundHint();
  const cfg = STAGES[state.stage - 1];
  const d = choice(remaining);
  addHintRing(leftMarkers, d, cfg);
  addHintRing(rightMarkers, d, cfg);
  scoreVal.textContent = computeCurrentScore();
});

/* ---------- 스테이지 종료 ---------- */
function endStageWin() {
  const score = computeCurrentScore();
  let stars = 1;
  if (state.hintsUsed === 0 && score >= 140) stars = 3;
  else if (score >= 90) stars = 2;

  const starsMap = loadStars();
  const prevStars = starsMap[state.stage] || 0;
  starsMap[state.stage] = Math.max(prevStars, stars);
  saveStars(starsMap);

  const bestMap = loadBestScores();
  const prevBest = bestMap[state.stage] || 0;
  const isNewBest = score > prevBest;
  bestMap[state.stage] = Math.max(prevBest, score);
  saveBestScores(bestMap);

  const unlocked = loadUnlocked();
  if (state.stage + 1 > unlocked) saveUnlocked(Math.min(TOTAL_STAGES, state.stage + 1));

  soundWin();
  $('winStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
  $('winTime').textContent = `⏱ 남은 시간 ${fmtTime(state.timeLeft)} · 실수 ${state.mistakes}회 · 힌트 ${state.hintsUsed}회`;
  $('winScore').textContent = `획득 점수 ${score}점`;
  $('winBest').textContent = isNewBest ? '🎉 이 스테이지 최고 점수 갱신!' : `최고 점수 ${bestMap[state.stage]}점`;
  $('nextStageBtn').classList.toggle('hidden', state.stage >= TOTAL_STAGES);
  winModal.classList.remove('hidden');
}

function endStageFail(reason) {
  state.active = false;
  soundFail();
  if (reason === 'mistakes') {
    $('failEmojis').textContent = '❌😅';
    $('failTitle').textContent = `실수를 ${MISTAKE_LIMIT}번 해서 실패했어요!`;
  } else {
    $('failEmojis').textContent = '⏰😅';
    $('failTitle').textContent = '시간이 다 됐어요!';
  }
  $('failDesc').textContent = `${state.found} / ${state.diffCount}개를 찾았어요. 조금만 더 힘내봐요!`;
  failModal.classList.remove('hidden');
}

/* ---------- 모달 버튼 ---------- */
$('nextStageBtn').addEventListener('click', () => {
  winModal.classList.add('hidden');
  if (state.stage < TOTAL_STAGES) startStage(state.stage + 1);
});
$('playAgainBtn').addEventListener('click', () => { winModal.classList.add('hidden'); startStage(state.stage); });
$('winHomeBtn').addEventListener('click', () => { winModal.classList.add('hidden'); goHome(); });
$('retryBtn').addEventListener('click', () => { failModal.classList.add('hidden'); startStage(state.stage); });
$('failHomeBtn').addEventListener('click', () => { failModal.classList.add('hidden'); goHome(); });

$('restartBtn').addEventListener('click', () => { soundClick(); startStage(state.stage); });
$('homeBtn').addEventListener('click', () => { soundClick(); goHome(); });

function goHome() {
  stopTimer();
  state.active = false;
  renderStageGrid();
  showScreen(startScreen);
}

/* ---------- 소리 / 도움말 ---------- */
soundBtn.addEventListener('click', () => {
  soundOn = !soundOn;
  localStorage.setItem('sgc_soundOn', soundOn ? 'on' : 'off');
  updateSoundBtn();
  if (soundOn) soundClick();
});
$('howtoBtn').addEventListener('click', () => howtoModal.classList.remove('hidden'));
$('closeHowtoBtn').addEventListener('click', () => howtoModal.classList.add('hidden'));
