/**
 * recognizer.js — 인식기 인터페이스
 *
 * 교체 가능한 구조: Vision API → ML Kit → 로컬 모델 등
 */

import { recognizeWithVisionAPI } from './visionApi.js';

/**
 * 캔버스 이미지에서 텍스트를 인식
 * @param {string} imageDataUrl - base64 PNG data URL
 * @param {string} apiKey - Google Cloud Vision API 키
 * @returns {Promise<{text: string, confidence: number} | null>}
 */
export async function recognizeHandwriting(imageDataUrl, apiKey) {
  if (!apiKey) {
    // API 키 없으면 빈 결과 반환 (사용자가 직접 타이핑하도록)
    return null;
  }

  try {
    const result = await recognizeWithVisionAPI(imageDataUrl, apiKey);
    return result;
  } catch (error) {
    console.error('Recognition failed:', error);
    throw error;
  }
}
