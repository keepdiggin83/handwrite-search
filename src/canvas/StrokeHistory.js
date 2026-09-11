/**
 * StrokeHistory — 획 단위 Undo/Redo 관리
 *
 * 최대 20단계 이력 유지 (기획서 FR-02)
 * 전체 삭제 → 1회 undo로 복구 가능
 */

const MAX_HISTORY = 20;

export class StrokeHistory {
  constructor() {
    /** @type {Array<Array<{x:number,y:number,pressure:number,timestamp:number}>>} */
    this.strokes = [];
    /** @type {Array<Array<{x:number,y:number,pressure:number,timestamp:number}>>} */
    this.redoStack = [];
    /** @type {Array<Array<{x:number,y:number,pressure:number,timestamp:number}>>|null} */
    this.clearedSnapshot = null;

    this._onChange = null;
  }

  /**
   * @param {(canUndo: boolean, canRedo: boolean) => void} callback
   */
  onChange(callback) {
    this._onChange = callback;
  }

  /** @private */
  _notify() {
    this._onChange?.(this.canUndo(), this.canRedo());
  }

  /**
   * 새 획 추가
   * @param {Array<{x:number, y:number, pressure:number, timestamp:number}>} stroke
   */
  push(stroke) {
    if (!stroke || stroke.length === 0) return;

    this.strokes.push(stroke);
    this.redoStack = [];
    this.clearedSnapshot = null;

    // 이력 제한
    if (this.strokes.length > MAX_HISTORY) {
      this.strokes.shift();
    }

    this._notify();
  }

  /**
   * 되돌리기
   * @returns {boolean} 성공 여부
   */
  undo() {
    // 전체 삭제 상태에서 undo → 복구
    if (this.strokes.length === 0 && this.clearedSnapshot) {
      this.strokes = this.clearedSnapshot;
      this.clearedSnapshot = null;
      this._notify();
      return true;
    }

    if (this.strokes.length === 0) return false;

    const stroke = this.strokes.pop();
    this.redoStack.push(stroke);
    this._notify();
    return true;
  }

  /**
   * 다시 실행
   * @returns {boolean} 성공 여부
   */
  redo() {
    if (this.redoStack.length === 0) return false;

    const stroke = this.redoStack.pop();
    this.strokes.push(stroke);
    this._notify();
    return true;
  }

  /**
   * 전체 삭제 (1회 undo로 복구 가능)
   */
  clearAll() {
    if (this.strokes.length === 0) return;

    this.clearedSnapshot = [...this.strokes];
    this.strokes = [];
    this.redoStack = [];
    this._notify();
  }

  canUndo() {
    return this.strokes.length > 0 || this.clearedSnapshot !== null;
  }

  canRedo() {
    return this.redoStack.length > 0;
  }

  hasStrokes() {
    return this.strokes.length > 0;
  }

  getAllStrokes() {
    return this.strokes;
  }
}
