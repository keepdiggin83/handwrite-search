/**
 * visionApi.js — Google Cloud Vision API 연동
 *
 * 캔버스 이미지를 DOCUMENT_TEXT_DETECTION으로 필기 인식.
 * 한국어 + 영어 혼합 지원.
 * 월 1,000건 무료 티어.
 */

const VISION_API_URL = 'https://vision.googleapis.com/v1/images:annotate';

/**
 * Google Cloud Vision API로 손글씨 인식
 * @param {string} imageDataUrl - base64 PNG data URL (data:image/png;base64,...)
 * @param {string} apiKey - API 키
 * @returns {Promise<{text: string, confidence: number}>}
 */
export async function recognizeWithVisionAPI(imageDataUrl, apiKey) {
  // data URL에서 base64 부분만 추출
  const base64Image = imageDataUrl.replace(/^data:image\/\w+;base64,/, '');

  const requestBody = {
    requests: [
      {
        image: {
          content: base64Image,
        },
        features: [
          {
            type: 'DOCUMENT_TEXT_DETECTION',
            maxResults: 1,
          },
        ],
        imageContext: {
          languageHints: ['ko', 'en'],
        },
      },
    ],
  };

  const response = await fetch(`${VISION_API_URL}?key=${apiKey}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const message = errorData?.error?.message || `API Error: ${response.status}`;
    throw new Error(message);
  }

  const data = await response.json();
  const annotations = data.responses?.[0];

  if (annotations?.error) {
    throw new Error(annotations.error.message);
  }

  const fullText = annotations?.fullTextAnnotation?.text?.trim();

  if (!fullText) {
    return { text: '', confidence: 0 };
  }

  // 줄바꿈을 공백으로 치환 (한두 줄 질문 기준)
  const cleanedText = fullText.replace(/\n+/g, ' ').trim();

  // 전체 신뢰도 추정 (블록 레벨)
  const pages = annotations?.fullTextAnnotation?.pages || [];
  let totalConfidence = 0;
  let symbolCount = 0;

  for (const page of pages) {
    for (const block of page.blocks || []) {
      for (const paragraph of block.paragraphs || []) {
        for (const word of paragraph.words || []) {
          for (const symbol of word.symbols || []) {
            if (symbol.confidence != null) {
              totalConfidence += symbol.confidence;
              symbolCount++;
            }
          }
        }
      }
    }
  }

  const avgConfidence = symbolCount > 0 ? totalConfidence / symbolCount : 0.5;

  return {
    text: cleanedText,
    confidence: avgConfidence,
  };
}
