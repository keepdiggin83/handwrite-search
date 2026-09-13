/**
 * InkCanvas — 필기 캔버스
 *
 * Pointer Events API로 Apple Pencil/스타일러스 입력을 처리.
 * 압력(pressure)에 따른 선 굵기 변화를 지원.
 * 마지막 획 후 700ms 대기 → 인식 준비 콜백 호출.
 */

import { StrokeHistory } from './StrokeHistory.js';

const AUTO_RECOGNIZE_DELAY = 700; // ms

export class InkCanvas {
  /**
   * @param {HTMLCanvasElement} canvasEl
   * @param {object} options
   */
  constructor(canvasEl, options = {}) {
    this.canvas = canvasEl;
    this.ctx = canvasEl.getContext('2d', { willReadFrequently: true });
    this.history = new StrokeHistory();

    // Settings
    this.inkColor = options.inkColor || '#E8EAED';
    this.baseLineWidth = options.baseLineWidth || 3;
    this.inputMode = options.inputMode || 'all'; // 'pen' | 'all'
    this.eraserMode = false;
    this._autoRecognizeDelay = options.autoRecognizeDelay || 700; // ms

    // Current stroke state
    this._currentStroke = [];
    this._isDrawing = false;
    this._lastPointerType = null;

    // Auto-recognize timer
    this._recognizeTimer = null;
    this._onReadyToRecognize = null;

    // Resize handling
    this._resizeObserver = null;
    this._dpr = window.devicePixelRatio || 1;

    this._init();
  }

  /** @private */
  _init() {
    this._setupResize();
    this._setupEvents();

    this.history.onChange((canUndo, canRedo) => {
      this._onHistoryChange?.(canUndo, canRedo);
    });
  }

  /** @private */
  _setupResize() {
    const resize = () => {
      const rect = this.canvas.parentElement.getBoundingClientRect();
      this._dpr = window.devicePixelRatio || 1;
      this.canvas.width = rect.width * this._dpr;
      this.canvas.height = rect.height * this._dpr;
      this.canvas.style.width = rect.width + 'px';
      this.canvas.style.height = rect.height + 'px';
      this.ctx.scale(this._dpr, this._dpr);
      this._redrawAll();
    };

    this._resizeObserver = new ResizeObserver(resize);
    this._resizeObserver.observe(this.canvas.parentElement);
    resize();
  }

  /** @private */
  _setupEvents() {
    this.canvas.addEventListener('pointerdown', (e) => this._onPointerDown(e));
    this.canvas.addEventListener('pointermove', (e) => this._onPointerMove(e));
    this.canvas.addEventListener('pointerup', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointercancel', (e) => this._onPointerUp(e));
    this.canvas.addEventListener('pointerleave', (e) => this._onPointerUp(e));

    // Prevent context menu on long press
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  /** @private */
  _shouldAcceptInput(e) {
    if (this.inputMode === 'pen') {
      return e.pointerType === 'pen';
    }
    // 'all' mode: accept pen & touch, ignore mouse on touch devices
    return e.pointerType === 'pen' || e.pointerType === 'touch' || e.pointerType === 'mouse';
  }

  /** @private */
  _getPoint(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      timestamp: e.timeStamp,
    };
  }

  /** @private */
  _onPointerDown(e) {
    if (!this._shouldAcceptInput(e)) return;

    e.preventDefault();
    this.canvas.setPointerCapture(e.pointerId);

    this._isDrawing = true;
    this._lastPointerType = e.pointerType;
    this._currentStroke = [];

    // Cancel auto-recognize timer
    clearTimeout(this._recognizeTimer);

    const point = this._getPoint(e);
    this._currentStroke.push(point);

    if (this.eraserMode) {
      this._eraseAt(point.x, point.y);
    } else {
      this.ctx.beginPath();
      this.ctx.moveTo(point.x, point.y);
    }
  }

  /** @private */
  _onPointerMove(e) {
    if (!this._isDrawing) return;
    if (!this._shouldAcceptInput(e)) return;

    e.preventDefault();

    const point = this._getPoint(e);
    this._currentStroke.push(point);

    if (this.eraserMode) {
      this._eraseAt(point.x, point.y);
      return;
    }

    // 압력에 따른 선 굵기
    const lineWidth = this.baseLineWidth * (0.5 + point.pressure * 1.2);

    this.ctx.strokeStyle = this.inkColor;
    this.ctx.lineWidth = lineWidth;
    this.ctx.lineCap = 'round';
    this.ctx.lineJoin = 'round';
    this.ctx.globalCompositeOperation = 'source-over';

    this.ctx.lineTo(point.x, point.y);
    this.ctx.stroke();
    this.ctx.beginPath();
    this.ctx.moveTo(point.x, point.y);
  }

  /** @private */
  _onPointerUp(e) {
    if (!this._isDrawing) return;

    this._isDrawing = false;

    if (this.eraserMode) {
      // 지우개 모드에서는 획 히스토리 재구성
      return;
    }

    // 획이 유효하면 히스토리에 추가
    if (this._currentStroke.length >= 2) {
      // 색상과 굵기 정보를 획에 첨부
      const strokeData = this._currentStroke.map((p) => ({
        ...p,
        color: this.inkColor,
        lineWidth: this.baseLineWidth,
      }));
      this.history.push(strokeData);

      // Auto-recognize 타이머 시작
      this._startRecognizeTimer();
    }

    this._currentStroke = [];
    this.ctx.beginPath();
  }

  /** @private */
  _eraseAt(x, y) {
    const eraserRadius = 20;
    const strokes = this.history.getAllStrokes();
    let changed = false;

    for (let i = strokes.length - 1; i >= 0; i--) {
      const stroke = strokes[i];
      for (const point of stroke) {
        const dx = point.x - x;
        const dy = point.y - y;
        if (dx * dx + dy * dy < eraserRadius * eraserRadius) {
          strokes.splice(i, 1);
          changed = true;
          break;
        }
      }
    }

    if (changed) {
      this._redrawAll();
    }
  }

  /** @private */
  _startRecognizeTimer() {
    clearTimeout(this._recognizeTimer);
    this._recognizeTimer = setTimeout(() => {
      this._onReadyToRecognize?.();
    }, this._autoRecognizeDelay);
  }

  /** 모든 획 다시 그리기 */
  _redrawAll() {
    const w = this.canvas.width / this._dpr;
    const h = this.canvas.height / this._dpr;
    this.ctx.clearRect(0, 0, w, h);

    for (const stroke of this.history.getAllStrokes()) {
      if (stroke.length < 2) continue;

      this.ctx.beginPath();
      this.ctx.strokeStyle = stroke[0].color || this.inkColor;
      this.ctx.lineCap = 'round';
      this.ctx.lineJoin = 'round';
      this.ctx.globalCompositeOperation = 'source-over';

      this.ctx.moveTo(stroke[0].x, stroke[0].y);

      for (let i = 1; i < stroke.length; i++) {
        const p = stroke[i];
        const baseW = p.lineWidth || this.baseLineWidth;
        this.ctx.lineWidth = baseW * (0.5 + p.pressure * 1.2);
        this.ctx.lineTo(p.x, p.y);
        this.ctx.stroke();
        this.ctx.beginPath();
        this.ctx.moveTo(p.x, p.y);
      }
    }
  }

  // --- Public API ---

  /**
   * 캔버스를 이미지 데이터로 변환 (인식용)
   * @returns {string} base64 PNG data URL
   */
  toDataURL() {
    // 흰 배경에 검정 잉크로 변환 (OCR 최적화)
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = this.canvas.width;
    tempCanvas.height = this.canvas.height;
    const tempCtx = tempCanvas.getContext('2d');

    // 흰 배경
    tempCtx.fillStyle = '#FFFFFF';
    tempCtx.fillRect(0, 0, tempCanvas.width, tempCanvas.height);

    // 검정 잉크로 다시 그리기
    tempCtx.scale(this._dpr, this._dpr);
    for (const stroke of this.history.getAllStrokes()) {
      if (stroke.length < 2) continue;

      tempCtx.beginPath();
      tempCtx.strokeStyle = '#000000';
      tempCtx.lineCap = 'round';
      tempCtx.lineJoin = 'round';
      tempCtx.moveTo(stroke[0].x, stroke[0].y);

      for (let i = 1; i < stroke.length; i++) {
        const p = stroke[i];
        const baseW = p.lineWidth || this.baseLineWidth;
        tempCtx.lineWidth = baseW * (0.5 + p.pressure * 1.2);
        tempCtx.lineTo(p.x, p.y);
        tempCtx.stroke();
        tempCtx.beginPath();
        tempCtx.moveTo(p.x, p.y);
      }
    }

    return tempCanvas.toDataURL('image/png');
  }

  /** 되돌리기 */
  undo() {
    if (this.history.undo()) {
      this._redrawAll();
    }
  }

  /** 다시 실행 */
  redo() {
    if (this.history.redo()) {
      this._redrawAll();
    }
  }

  /** 전체 삭제 */
  clearAll() {
    this.history.clearAll();
    this._redrawAll();
    clearTimeout(this._recognizeTimer);
  }

  /** 지우개 토글 */
  toggleEraser() {
    this.eraserMode = !this.eraserMode;
    this.canvas.style.cursor = this.eraserMode ? 'cell' : 'crosshair';
    return this.eraserMode;
  }

  /** 지우개 해제 */
  setEraserOff() {
    this.eraserMode = false;
    this.canvas.style.cursor = 'crosshair';
  }

  /** 설정 변경 */
  setInkColor(color) {
    this.inkColor = color;
  }

  setLineWidth(width) {
    this.baseLineWidth = width;
  }

  setInputMode(mode) {
    this.inputMode = mode;
  }

  hasStrokes() {
    return this.history.hasStrokes();
  }

  /** 콜백 등록 */
  onReadyToRecognize(callback) {
    this._onReadyToRecognize = callback;
  }

  onHistoryChange(callback) {
    this._onHistoryChange = callback;
  }

  destroy() {
    this._resizeObserver?.disconnect();
    clearTimeout(this._recognizeTimer);
  }
}
