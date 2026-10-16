// -----------------------------------------------------------------------------
// Doorbell images.
//
// The doorbells upload their snapshots to Cloudinary (`res.cloudinary.com`),
// and the API hands back its URL. Gladys takes camera images of at most
// 150 KB (dashboard widget images: 300 KB) and never resizes them, and this
// integration has no image library (no native dependency in the sandbox):
// we ask Cloudinary for a downscaled rendition instead, through its URL
// transformations (`/upload/c_limit,w_640,q_60/...`), trying smaller ones
// until the image fits.
// -----------------------------------------------------------------------------

import { createLogger } from '@gladysassistant/integration-sdk';

const logger = createLogger({ name: 'images' });

export const CAMERA_IMAGE_MAX_BYTES = 150 * 1024;
export const WIDGET_IMAGE_MAX_BYTES = 300 * 1024;

const RENDITIONS = ['c_limit,w_800,q_70', 'c_limit,w_640,q_60', 'c_limit,w_480,q_50'];
const FETCH_TIMEOUT_MS = 10_000;

/**
 * Candidate URLs for an image, best quality first. A non-Cloudinary URL has
 * no transformations: only the original is tried.
 * @param {string} url
 */
export function imageCandidates(url) {
  const marker = '/image/upload/';
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return [];
  }
  if (parsed.protocol !== 'https:') {
    return [];
  }
  if (!parsed.hostname.endsWith('cloudinary.com') || !parsed.pathname.includes(marker)) {
    return [url];
  }
  return [url, ...RENDITIONS.map((rendition) => url.replace(marker, `${marker}${rendition}/`))];
}

/**
 * Download an image that fits within `maxBytes`.
 * @param {string} url
 * @param {object} [options]
 * @param {number} [options.maxBytes]
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<Buffer | null>} null when no rendition fits
 */
export async function fetchImage(
  url,
  { maxBytes = CAMERA_IMAGE_MAX_BYTES, fetchImpl = fetch } = {},
) {
  for (const candidate of imageCandidates(url)) {
    try {
      const response = await fetchImpl(candidate, {
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });
      if (!response.ok) {
        continue;
      }
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > 0 && buffer.length <= maxBytes) {
        return buffer;
      }
    } catch (err) {
      logger.debug(`Image download failed: ${err.message}`);
    }
  }
  return null;
}

/** The `image/jpg;base64,...` string Gladys expects for a camera image. */
export function toCameraImage(buffer) {
  return `image/jpg;base64,${buffer.toString('base64')}`;
}
