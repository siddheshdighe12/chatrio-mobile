import { api } from './api';

/**
 * Resolves any media/attachment/avatar URL to point to the active backend API.
 *
 * If the URL is a bare relative path containing `/uploads/...` (e.g. from an older
 * local IP address, another network, or emulator), this extracts the `/uploads/...`
 * path and prepends the current `api.defaults.baseURL`.
 *
 * External absolute URLs (Supabase CDN, Dicebear avatars, etc.) are preserved
 * as-is — even if they happen to contain `/uploads/` in their path — because
 * they are already correct public CDN URLs and must not be rewritten.
 */
export function resolveMediaUrl(url?: string | null): string {
  if (!url || typeof url !== 'string') return '';

  const trimmed = url.trim();

  // Only rewrite bare /uploads/... paths (no scheme). Absolute CDN URLs
  // (including Supabase Storage URLs that contain /uploads/ in their path)
  // must be returned unchanged.
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }

  const uploadIndex = trimmed.indexOf('/uploads/');
  if (uploadIndex !== -1) {
    const uploadPath = trimmed.substring(uploadIndex);
    const baseURL = (api.defaults.baseURL || '').replace(/\/+$/, '');
    return `${baseURL}${uploadPath}`;
  }

  // Fully return any other URL (relative or absolute) unchanged.
  return trimmed;
}
