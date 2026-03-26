/**
 * Normalize FastAPI / Axios error payloads for display.
 */
export function formatApiError(error, fallback = 'Something went wrong. Try again.') {
  if (!error) return fallback;
  const detail = error.response?.data?.detail;
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => (typeof item === 'object' && item?.msg ? item.msg : String(item)))
      .join(' ');
  }
  if (detail && typeof detail === 'object') return detail.message || JSON.stringify(detail);
  return error.message || fallback;
}
