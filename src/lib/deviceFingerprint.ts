// Multi-layer device identification and hardware fingerprinting utility
// Used to prevent buddy-punching (scanning QR code on behalf of another employee using the same phone)

const DEVICE_STORAGE_KEY = 'timesync_bound_device_id_v1';
const COOKIE_NAME = 'ts_dev_id_v1';

function readCookie(name: string): string | null {
  try {
    const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[2]) : null;
  } catch {
    return null;
  }
}

function writeCookie(name: string, value: string, days = 365) {
  try {
    const expires = new Date(Date.now() + days * 864e5).toUTCString();
    document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
  } catch {
    // ignore cookie errors in restricted contexts
  }
}

function simpleHash(input: string): string {
  let h1 = 0xdeadbeef ^ input.length;
  let h2 = 0x41c6ce57 ^ input.length;
  for (let i = 0, ch; i < input.length; i++) {
    ch = input.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  const combined = 4294967296 * (2097151 & h2) + (h1 >>> 0);
  return combined.toString(36).toUpperCase().padStart(8, '0').slice(0, 8);
}

/**
 * Retrieves or generates a persistent Device ID stored across localStorage, sessionStorage, cookies, and window.name.
 */
export function getOrCreateDeviceId(): string {
  let existingId: string | null = null;

  try {
    existingId = localStorage.getItem(DEVICE_STORAGE_KEY);
  } catch {
    // ignore
  }

  if (!existingId) {
    try {
      existingId = sessionStorage.getItem(DEVICE_STORAGE_KEY);
    } catch {
      // ignore
    }
  }

  if (!existingId) {
    existingId = readCookie(COOKIE_NAME);
  }

  if (!existingId) {
    try {
      if (window.name && window.name.startsWith('TSDEV:')) {
        existingId = window.name.replace('TSDEV:', '').trim();
      }
    } catch {
      // ignore
    }
  }

  if (!existingId || existingId.length < 8) {
    const randomPart =
      Math.random().toString(36).substring(2, 6).toUpperCase() +
      '-' +
      Math.random().toString(36).substring(2, 6).toUpperCase();
    const hwPart = getHardwareSignature().replace('HW-', '').slice(0, 4);
    existingId = `DEV-${hwPart}-${randomPart}`;
  }

  // Persist across all available client stores
  try {
    localStorage.setItem(DEVICE_STORAGE_KEY, existingId);
  } catch {
    // ignore
  }
  try {
    sessionStorage.setItem(DEVICE_STORAGE_KEY, existingId);
  } catch {
    // ignore
  }
  writeCookie(COOKIE_NAME, existingId, 365);
  try {
    if (!window.name || window.name.startsWith('TSDEV:')) {
      window.name = `TSDEV:${existingId}`;
    }
  } catch {
    // ignore
  }

  return existingId;
}

function getWebGLRendererInfo(): string {
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl') as WebGLRenderingContext | null) ||
      (canvas.getContext('experimental-webgl') as WebGLRenderingContext | null);
    if (!gl) return 'no-webgl';
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return 'webgl-std';
    const vendor = gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || '';
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || '';
    return `${vendor}|${renderer}`;
  } catch {
    return 'webgl-err';
  }
}

/**
 * Generates a deterministic hardware signature that stays consistent on the same physical device
 * even when switching to Incognito mode.
 */
export function getHardwareSignature(): string {
  try {
    const ua = navigator.userAgent || '';
    let osTag = 'Other';
    if (/iPhone|iPad|iPod/i.test(ua)) {
      const osMatch = ua.match(/OS (\d+[_\d]*)/);
      osTag = `iOS-${osMatch ? osMatch[1] : ''}`;
    } else if (/Android/i.test(ua)) {
      const andMatch = ua.match(/Android\s+([\d.]+)/i);
      osTag = `Android-${andMatch ? andMatch[1] : ''}`;
    } else if (/Macintosh|Mac OS X/i.test(ua)) {
      osTag = 'Mac';
    } else if (/Windows/i.test(ua)) {
      osTag = 'Win';
    }

    const screenDims = [
      Math.min(window.screen.width, window.screen.height),
      Math.max(window.screen.width, window.screen.height),
      window.devicePixelRatio || 1,
      window.screen.colorDepth || 24,
    ].join('x');

    const cores = navigator.hardwareConcurrency || 0;
    const mem = (navigator as any).deviceMemory || 0;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || '';
    const touchPoints = navigator.maxTouchPoints || 0;
    const gpu = getWebGLRendererInfo();

    const raw = `${osTag}|${screenDims}|c${cores}|m${mem}|t${touchPoints}|${tz}|${gpu}`;
    return `HW-${simpleHash(raw)}`;
  } catch {
    return 'HW-DEFAULT0';
  }
}

/**
 * Returns a concise human-readable label for the mobile/desktop device.
 */
export function getDeviceModelLabel(): string {
  try {
    const ua = navigator.userAgent || '';
    let platform = 'อุปกรณ์ทั่วไป';
    if (/iPhone/i.test(ua)) platform = 'iPhone';
    else if (/iPad/i.test(ua)) platform = 'iPad';
    else if (/Android/i.test(ua)) {
      const modelMatch = ua.match(/;\s*([^;)]+)\s+Build\//i);
      platform = modelMatch && modelMatch[1] ? `Android (${modelMatch[1].trim().slice(0, 18)})` : 'Android';
    } else if (/Macintosh/i.test(ua)) platform = 'Mac';
    else if (/Windows/i.test(ua)) platform = 'Windows PC';

    const w = Math.min(window.screen.width, window.screen.height);
    const h = Math.max(window.screen.width, window.screen.height);
    return `${platform} · ${w}×${h}`;
  } catch {
    return 'Mobile Device';
  }
}

/**
 * Formats a short readable Device ID badge (e.g. DEV-A1B2-9F3C -> DEV-A1B2..9F3C or last 8 chars)
 */
export function getShortDeviceCode(deviceId?: string | null): string {
  if (!deviceId) return '-';
  if (deviceId.length <= 12) return deviceId;
  return deviceId.slice(0, 12);
}
