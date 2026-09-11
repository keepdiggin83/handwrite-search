/**
 * googleSearch.js — Google 검색 연동
 */

const GOOGLE_SEARCH_URL = 'https://www.google.com/search';

/**
 * Google 검색 URL 생성
 * @param {string} query - 검색어
 * @returns {string} 검색 URL
 */
export function buildSearchUrl(query) {
  const params = new URLSearchParams({ q: query });
  return `${GOOGLE_SEARCH_URL}?${params.toString()}`;
}

/**
 * 새 탭에서 Google 검색
 * @param {string} query
 */
export function searchInNewTab(query) {
  const url = buildSearchUrl(query);
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * 검색 기록 관리
 */
const HISTORY_KEY = 'handwrite-search-history';
const MAX_HISTORY = 50;

export function getSearchHistory() {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function addToHistory(query) {
  const history = getSearchHistory();
  // 중복 제거
  const filtered = history.filter((item) => item.query !== query);
  filtered.unshift({
    query,
    timestamp: Date.now(),
  });

  // 최대 개수 제한
  if (filtered.length > MAX_HISTORY) {
    filtered.pop();
  }

  localStorage.setItem(HISTORY_KEY, JSON.stringify(filtered));
  return filtered;
}

export function clearHistory() {
  localStorage.removeItem(HISTORY_KEY);
}
