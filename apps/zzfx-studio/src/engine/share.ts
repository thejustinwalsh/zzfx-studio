/**
 * The parts of sharing that every startup needs.
 *
 * Deliberately dependency-free string and arithmetic work: reading a parameter
 * out of a URL, and deciding which UI the viewport can hold. Packing,
 * compression and base64 live in `shareCodec`, which is imported lazily — most
 * visits neither share nor open a shared link, so that code has no business in
 * the bundle that paints the first frame.
 */

export const SHARE_PARAM = 's';

/**
 * The studio's fixed chrome — transport, sequence strip, oscilloscope,
 * instrument cards and the grid header — before a single row of pattern data.
 * Measured from the running app rather than estimated.
 */
export const STUDIO_CHROME_HEIGHT = 399;
export const GRID_ROW_HEIGHT = 19.5;

/** Below four visible rows the studio is furniture, not an instrument. */
export const MIN_USABLE_ROWS = 4;
/** Where it stops feeling cramped. */
export const IDEAL_ROWS = 8;

/** Height at which the studio can still show `rows` rows of pattern data. */
export function studioHeightForRows(rows: number): number {
  return Math.ceil(STUDIO_CHROME_HEIGHT + rows * GRID_ROW_HEIGHT);
}

/**
 * The mini player is chosen by height, and only by height — a share link and an
 * embed link are the same link, and the frame decides which one you get.
 *
 * The threshold is exactly where the studio stops being usable: fewer than four
 * rows of pattern data. It lands above a phone in landscape, so a phone held
 * sideways gets the player, which is correct — the studio could not show even
 * one row there.
 */
export const MINI_PLAYER_MAX_HEIGHT = studioHeightForRows(MIN_USABLE_ROWS) - 1;

/** Comfortable studio height — eight rows visible. */
export const STUDIO_IDEAL_HEIGHT = studioHeightForRows(IDEAL_ROWS);

/** Tall enough for the player's own chrome, far below the studio threshold. */
export const DEFAULT_EMBED_HEIGHT = 180;
/** Wide enough for the title, the settings line and the channel legend. */
export const DEFAULT_EMBED_WIDTH = 520;

export function shouldShowMiniPlayer(viewportHeight: number): boolean {
  return viewportHeight <= MINI_PLAYER_MAX_HEIGHT;
}

/** Pull the share code out of a URL, if it carries one. */
export function shareCodeFromUrl(url: string): string | null {
  const q = url.indexOf('?');
  if (q < 0) return null;
  const search = url.slice(q + 1).split('#')[0];
  for (const pair of search.split('&')) {
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    if (pair.slice(0, eq) === SHARE_PARAM) {
      try { return decodeURIComponent(pair.slice(eq + 1)); } catch { return null; }
    }
  }
  return null;
}

/**
 * A paste-ready iframe at a fixed size, since size is what selects the mini
 * player. `allow="autoplay"` does not make it autoplay — nothing here does — it
 * grants the frame permission to start audio once the visitor presses play,
 * which a cross-origin frame is otherwise refused.
 */
export function embedSnippet(
  url: string,
  title: string,
  width: number = DEFAULT_EMBED_WIDTH,
  height: number = DEFAULT_EMBED_HEIGHT
): string {
  // This string is pasted straight into someone's page, so every interpolated
  // value is escaped — a song name is user input and the URL is built from it.
  const esc = (v: string) =>
    v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const safe = esc(title);
  return (
    `<iframe src="${esc(url)}" width="${width}" height="${height}" frameborder="0" ` +
    `allow="autoplay" loading="lazy" title="${safe}"></iframe>`
  );
}

/** The lazily-loaded half. Everything here is async by construction. */
export function loadShareCodec() {
  return import('./shareCodec');
}

/**
 * Start fetching the codec without waiting for it.
 *
 * Called when the export screen opens, so the download overlaps the time spent
 * reading that screen instead of stalling the first press of share.
 */
export function prefetchShareCodec(): void {
  void loadShareCodec().catch(() => {});
}
