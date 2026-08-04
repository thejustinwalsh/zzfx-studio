/**
 * Who owns which MIDI input.
 *
 * Two independent systems listen to MIDI here: generic note input, which binds
 * every port, and Launchpad control, which binds one. Both used
 * `input.onmidimessage`, a single slot — so whichever connected last silently
 * replaced the other's handler, and whichever disconnected first cleared it for
 * both. The UI showed two things connected while only one received events.
 *
 * Two rules fix it, and both are needed:
 *
 *   1. Listeners attach with addEventListener, so several can coexist on a port
 *      and each removes only its own.
 *   2. A port can be *claimed*. The Launchpad claims its control port, and
 *      generic input skips claimed ports — otherwise both handlers would fire
 *      and a pad press would enter a note through the generic path as well as
 *      the layout path.
 *
 * Eager and framework-free: the claim has to outlive either module's lifetime
 * and both need to agree on it.
 */

const claims = new Set<string>();
const listeners = new Set<() => void>();

/** Take exclusive ownership of a port. Returns a release function. */
export function claimPort(id: string): () => void {
  claims.add(id);
  notify();
  return () => {
    claims.delete(id);
    notify();
  };
}

export function isPortClaimed(id: string): boolean {
  return claims.has(id);
}

/**
 * Run `fn` whenever the claims change.
 *
 * Generic input needs this because the two systems can be enabled in either
 * order: if the Launchpad claims its port after generic input has already
 * bound it, generic input has to let go.
 */
export function onClaimsChanged(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function notify(): void {
  for (const fn of [...listeners]) fn();
}

/** Test seam; nothing in the app should need to reset global claims. */
export function resetPortClaims(): void {
  claims.clear();
  listeners.clear();
}
