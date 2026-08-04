/**
 * Which channels accept incoming notes.
 *
 * Eager, unlike the rest of the MIDI code: the arm buttons work before anything
 * is connected, so putting this behind the lazy module would make the first
 * press download a protocol nobody asked for.
 */

/**
 * Flip one channel's arm state, leaving the others alone.
 *
 * The Launchpad's arm column and the on-screen buttons both go through here, so
 * neither can disturb a channel it was not pointed at, and the two can never
 * disagree about the result. Kept sorted so the set has one representation.
 */
export function toggleArmed(armed: readonly number[], channel: number): number[] {
  return armed.includes(channel)
    ? armed.filter((c) => c !== channel)
    : [...armed, channel].sort((a, b) => a - b);
}
