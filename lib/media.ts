import { api } from './api';

/**
 * Resolves any media/attachment/avatar URL to point to the active backend API.
 *
 * If the URL contains an `/uploads/...` path (e.g. from an older local IP address,
 * another network, or emulator), this extracts the `/uploads/...` path and prepends
 * the current `api.defaults.baseURL`.
 *
 * External URLs (such as Dicebear avatars, cloud CDNs, or external links) are preserved as-is.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();
  const uploadIndex = trimmed.indexOf('/uploads/');
  if (uploadIndex !== -1) {
    const uploadPath = trimmed.substring(uploadIndex);
    const baseURL = (api.defaults.baseURL || '').replace(/\/+$/, '');
    return `${baseURL}${uploadPath}`;
  }

  return trimmed;
}
