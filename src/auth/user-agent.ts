/**
 * Turns a User-Agent header into something a human recognises in the
 * "my devices" list, e.g. "Chrome on Windows (desktop)". Deliberately small:
 * no external library for a cosmetic label.
 */
export function describeDevice(ua?: string | null) {
  if (!ua) return 'Unknown device';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /Chrome\//.test(ua)
        ? 'Chrome'
        : /Firefox\//.test(ua)
          ? 'Firefox'
          : /Safari\//.test(ua)
            ? 'Safari'
            : /Dart|okhttp|CFNetwork/.test(ua)
              ? 'Mobile app'
              : 'Unknown client';
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /Android/.test(ua)
      ? 'Android'
      : /iPhone|iPad|iOS/.test(ua)
        ? 'iOS'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'unknown OS';
  const type = /Mobile|Android|iPhone/.test(ua)
    ? 'mobile'
    : /iPad|Tablet/.test(ua)
      ? 'tablet'
      : 'desktop';
  return `${browser} on ${os} (${type})`;
}
