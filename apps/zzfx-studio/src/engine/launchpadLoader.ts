/**
 * Split point for the Launchpad module.
 *
 * Separate from midiLoader: plain note input asks for `sysex: false`, while
 * anything that lights the device needs `sysex: true` and a heavier permission
 * prompt. Someone who only plugs in a keyboard should never pay for either.
 */
export function loadLaunchpad() {
  return import('./launchpadDevice');
}
