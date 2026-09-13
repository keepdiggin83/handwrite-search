/**
 * main.js — 앱 진입점
 *
 * 모든 모듈을 연결하고 상태를 관리한다.
 *
 * 상태 흐름:
 *   idle → writing → recognizing → reviewing → searched
 */

import './style.css';
import { InkCanvas } from './canvas/InkCanvas.js';
import { recognizeHandwriting } from './recognition/recognizer.js';
import { searchInNewTab, addToHistory, getSearchHistory } from './search/googleSearch.js';

// --- State ---
const state = {
  phase: 'idle', // idle | writing | recognizing | reviewing | searched
  apiKey: localStorage.getItem('handwrite-api-key') || '',
  inputMode: localStorage.getItem('handwrite-input-mode') || 'all',
  inkColor: localStorage.getItem('handwrite-ink-color') || '#E8EAED',
  penSize: parseInt(localStorage.getItem('handwrite-pen-size') || '3', 10),
  _recognitionSeq: 0, // 인식 요청 순번 (오래된 응답 무시용)
};

// --- DOM Elements ---
const $ = (sel) => document.querySelector(sel);

const elements = {
  // Canvas
  canvas: $('#ink-canvas'),
  canvasArea: $('#canvas-area'),

  // Toolbar
  btnUndo: $('#btn-undo'),
  btnRedo: $('#btn-redo'),
  btnEraser: $('#btn-eraser'),
  btnClear: $('#btn-clear'),
  btnRecognize: $('#btn-recognize'),

  // Recognition Bar
  recognitionBar: $('#recognition-bar'),
  recognitionStatus: $('#recognition-status'),
  recognitionResult: $('#recognition-result'),
  recognizedText: $('#recognized-text'),
  statusDot: $('.status-dot'),
  statusText: $('.status-text'),
  btnSearch: $('#btn-search'),

  // Search Area
  searchArea: $('#search-area'),
  emptyState: $('#empty-state'),
  searchResults: $('#search-results'),
  searchQueryDisplay: $('#search-query-display'),
  searchIframe: $('#search-iframe'),
  btnCloseResults: $('#btn-close-results'),

  // Header
  btnHistory: $('#btn-history'),
  btnSettings: $('#btn-settings'),

  // Settings Modal
  settingsModal: $('#settings-modal'),
  btnCloseSettings: $('#btn-close-settings'),
  settingApiKey: $('#setting-api-key'),
  btnFillApiKey: $('#btn-fill-api-key'),
  settingInputMode: $('#setting-input-mode'),
  settingPenSize: $('#setting-pen-size'),
  colorSwatches: document.querySelectorAll('.color-swatch'),

  // History Modal
  historyModal: $('#history-modal'),
  btnCloseHistory: $('#btn-close-history'),
  historyList: $('#history-list'),
};

// --- Initialize InkCanvas ---
const inkCanvas = new InkCanvas(elements.canvas, {
  inkColor: state.inkColor,
  baseLineWidth: state.penSize,
  inputMode: state.inputMode,
  autoRecognizeDelay: 1200, // 700ms -> 1200ms: 문장 완성 후 인식되도록 여유 확보
});


// --- Event Wiring ---

// Toolbar: Undo / Redo
elements.btnUndo.addEventListener('click', () => {
  inkCanvas.undo();
});

elements.btnRedo.addEventListener('click', () => {
  inkCanvas.redo();
});

// History change callback
inkCanvas.onHistoryChange((canUndo, canRedo) => {
  elements.btnUndo.disabled = !canUndo;
  elements.btnRedo.disabled = !canRedo;

  // Update phase
  if (inkCanvas.hasStrokes() && state.phase === 'idle') {
    setPhase('writing');
  } else if (!inkCanvas.hasStrokes() && state.phase !== 'reviewing' && state.phase !== 'searched') {
    setPhase('idle');
  }
});

// Toolbar: Eraser
elements.btnEraser.addEventListener('click', () => {
  const isEraser = inkCanvas.toggleEraser();
  elements.btnEraser.classList.toggle('active', isEraser);
});

// Toolbar: Clear
elements.btnClear.addEventListener('click', () => {
  inkCanvas.clearAll();
  inkCanvas.setEraserOff();
  elements.btnEraser.classList.remove('active');
  setPhase('idle');
});

// Toolbar: Recognize
elements.btnRecognize.addEventListener('click', () => {
  doRecognize();
});

// Auto-recognize callback (700ms after last stroke)
inkCanvas.onReadyToRecognize(() => {
  if (state.apiKey && inkCanvas.hasStrokes()) {
    doRecognize();
  }
});

// Search button
elements.btnSearch.addEventListener('click', () => {
  doSearch();
});

// Enter key in recognized text input
elements.recognizedText.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    doSearch();
  }
});

// Close search results
elements.btnCloseResults.addEventListener('click', () => {
  elements.searchResults.classList.add('hidden');
  elements.emptyState.classList.remove('hidden');
  elements.searchIframe.src = '';
});


// --- Settings Modal ---
elements.btnSettings.addEventListener('click', () => {
  elements.settingApiKey.value = state.apiKey;
  elements.settingInputMode.value = state.inputMode;
  elements.settingPenSize.value = state.penSize;
  updateColorSwatches();
  elements.settingsModal.classList.remove('hidden');
});

elements.btnCloseSettings.addEventListener('click', () => {
  elements.settingsModal.classList.add('hidden');
});

elements.settingsModal.addEventListener('click', (e) => {
  if (e.target === elements.settingsModal) {
    elements.settingsModal.classList.add('hidden');
  }
});

elements.settingApiKey.addEventListener('change', (e) => {
  state.apiKey = e.target.value.trim();
  localStorage.setItem('handwrite-api-key', state.apiKey);
});

// * 버튼: 저장된 API 키 자동 입력
elements.btnFillApiKey.addEventListener('click', () => {
  const PRESET_KEY = 'AIzaSyByAoINk9JgItndIBDi1Zy7ETy06u3rmhI';
  elements.settingApiKey.value = PRESET_KEY;
  state.apiKey = PRESET_KEY;
  localStorage.setItem('handwrite-api-key', PRESET_KEY);
  // 입력 완료 시각적 피드백
  elements.btnFillApiKey.classList.add('filled');
  setTimeout(() => elements.btnFillApiKey.classList.remove('filled'), 1500);
});

elements.settingInputMode.addEventListener('change', (e) => {
  state.inputMode = e.target.value;
  localStorage.setItem('handwrite-input-mode', state.inputMode);
  inkCanvas.setInputMode(state.inputMode);
});

elements.settingPenSize.addEventListener('input', (e) => {
  state.penSize = parseInt(e.target.value, 10);
  localStorage.setItem('handwrite-pen-size', state.penSize);
  inkCanvas.setLineWidth(state.penSize);
});

elements.colorSwatches.forEach((swatch) => {
  swatch.addEventListener('click', () => {
    const color = swatch.dataset.color;
    state.inkColor = color;
    localStorage.setItem('handwrite-ink-color', color);
    inkCanvas.setInkColor(color);
    document.documentElement.style.setProperty('--ink-color', color);
    updateColorSwatches();
  });
});

function updateColorSwatches() {
  elements.colorSwatches.forEach((s) => {
    s.classList.toggle('active', s.dataset.color === state.inkColor);
  });
}


// --- History Modal ---
elements.btnHistory.addEventListener('click', () => {
  renderHistory();
  elements.historyModal.classList.remove('hidden');
});

elements.btnCloseHistory.addEventListener('click', () => {
  elements.historyModal.classList.add('hidden');
});

elements.historyModal.addEventListener('click', (e) => {
  if (e.target === elements.historyModal) {
    elements.historyModal.classList.add('hidden');
  }
});

function renderHistory() {
  const history = getSearchHistory();

  if (history.length === 0) {
    elements.historyList.innerHTML =
      '<li class="history-empty">아직 검색 기록이 없습니다</li>';
    return;
  }

  elements.historyList.innerHTML = history
    .map(
      (item) => `
      <li class="history-item" data-query="${escapeHtml(item.query)}">
        <span class="history-item-text">${escapeHtml(item.query)}</span>
        <span class="history-item-time">${formatTime(item.timestamp)}</span>
      </li>
    `
    )
    .join('');

  // 클릭 시 해당 검색어로 재검색
  elements.historyList.querySelectorAll('.history-item').forEach((el) => {
    el.addEventListener('click', () => {
      elements.recognizedText.value = el.dataset.query;
      elements.historyModal.classList.add('hidden');
      setPhase('reviewing');
      doSearch();
    });
  });
}


// --- Core Functions ---


async function doRecognize() {
  if (!inkCanvas.hasStrokes()) return;

  // 요청마다 고유 순번 부여 — 응답이 돌아올 때 최신 요청인지 확인
  const seq = ++state._recognitionSeq;

  setPhase('recognizing');

  try {
    if (!state.apiKey) {
      if (seq !== state._recognitionSeq) return;
      setPhase('reviewing');
      elements.recognizedText.value = '';
      elements.recognizedText.placeholder = 'API 키가 없습니다. 검색어를 직접 입력하세요...';
      elements.recognizedText.focus();
      return;
    }

    const imageDataUrl = inkCanvas.toDataURL();
    const result = await recognizeHandwriting(imageDataUrl, state.apiKey);

    // 응답 도착 시 더 새로운 요청이 있으면 이 결과는 무시 (race condition 방지)
    if (seq !== state._recognitionSeq) {
      console.log(`[인식] 오래된 응답 무시 (seq=${seq}, 현재=${state._recognitionSeq})`);
      return;
    }

    if (result && result.text) {
      elements.recognizedText.value = result.text;
      elements.recognizedText.placeholder = '인식된 텍스트...';
      setPhase('reviewing');
    } else {
      elements.recognizedText.value = '';
      elements.recognizedText.placeholder = '인식 실패 — 다시 써 보거나 직접 입력하세요';
      setPhase('reviewing');
    }
  } catch (error) {
    console.error('Recognition error:', error);
    if (seq !== state._recognitionSeq) return; // 오래된 오류도 무시

    elements.recognizedText.value = '';
    if (error.message.includes('API key')) {
      elements.recognizedText.placeholder = 'API 키가 유효하지 않습니다. 설정을 확인하세요.';
    } else {
      elements.recognizedText.placeholder = `인식 오류: ${error.message}`;
    }

    setPhase('reviewing');
    setStatusError();
  }
}


function doSearch() {
  const query = elements.recognizedText.value.trim();
  if (!query) {
    elements.recognizedText.focus();
    return;
  }

  // 기록에 추가
  addToHistory(query);

  // 새 탭에서 Google 검색
  searchInNewTab(query);

  // UI 업데이트
  setPhase('searched');
  elements.searchQueryDisplay.textContent = `"${query}" 검색 결과를 새 탭에서 열었습니다`;
  elements.emptyState.classList.add('hidden');
  elements.searchResults.classList.remove('hidden');
  elements.searchIframe.classList.add('hidden');

  // 검색 완료 후 캔버스 초기화
  setTimeout(() => {
    inkCanvas.clearAll();
    inkCanvas.setEraserOff();
    elements.btnEraser.classList.remove('active');
  }, 500);
}


// --- Phase Management ---

function setPhase(phase) {
  state.phase = phase;

  const { recognitionStatus, recognitionResult, statusDot, statusText } = elements;

  switch (phase) {
    case 'idle':
      recognitionStatus.classList.remove('hidden');
      recognitionResult.classList.add('hidden');
      recognitionBar_reset();
      statusDot.className = 'status-dot';
      statusText.textContent = '캔버스에 질문을 써 주세요';
      elements.recognitionBar.classList.remove('recognizing');
      break;

    case 'writing':
      recognitionStatus.classList.remove('hidden');
      recognitionResult.classList.add('hidden');
      statusDot.className = 'status-dot active';
      statusText.textContent = '필기 중...';
      elements.recognitionBar.classList.remove('recognizing');
      break;

    case 'recognizing':
      recognitionStatus.classList.remove('hidden');
      recognitionResult.classList.add('hidden');
      statusDot.className = 'status-dot processing';
      statusText.textContent = '손글씨를 인식하고 있습니다...';
      elements.recognitionBar.classList.add('recognizing');
      break;

    case 'reviewing':
      recognitionStatus.classList.add('hidden');
      recognitionResult.classList.remove('hidden');
      elements.recognitionBar.classList.remove('recognizing');
      break;

    case 'searched':
      recognitionStatus.classList.add('hidden');
      recognitionResult.classList.remove('hidden');
      elements.recognitionBar.classList.remove('recognizing');
      break;
  }
}

function recognitionBar_reset() {
  elements.recognizedText.value = '';
  elements.recognizedText.placeholder = '인식된 텍스트...';
}

function setStatusError() {
  elements.statusDot?.classList.add('error');
  setTimeout(() => {
    elements.statusDot?.classList.remove('error');
  }, 3000);
}


// --- Utilities ---

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

function formatTime(timestamp) {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now - date;

  if (diff < 60 * 1000) return '방금 전';
  if (diff < 60 * 60 * 1000) return `${Math.floor(diff / 60000)}분 전`;
  if (diff < 24 * 60 * 60 * 1000) return `${Math.floor(diff / 3600000)}시간 전`;

  return date.toLocaleDateString('ko-KR', {
    month: 'short',
    day: 'numeric',
  });
}


// --- Init ---
setPhase('idle');
updateColorSwatches();

console.log('✏️ HandWrite Search initialized');
if (!state.apiKey) {
  console.log('💡 API 키가 설정되지 않았습니다. 설정(⚙️)에서 Google Cloud Vision API 키를 입력하세요.');
}
