/**
 * Loads the MIDI module on demand.
 *
 * Kept apart from `midi` itself so nothing at startup imports it — the same
 * split as `share` and `shareCodec`, which the web export confirms produces a
 * separate chunk rather than inlining.
 */
export function loadMidi() {
  return import('./midi');
}
