/** Loopback is available only in Expo development builds, never release builds. */
export function validMobileApiOrigin(value: string | undefined): boolean {
  if (!value) return false;
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || !['','/'].includes(url.pathname)) return false;
    const local = ['127.0.0.1','localhost','[::1]'].includes(url.hostname);
    if (local) return typeof __DEV__ !== 'undefined' && __DEV__ && url.protocol === 'http:' && url.port === '3001';
    return url.protocol === 'https:';
  } catch { return false; }
}
