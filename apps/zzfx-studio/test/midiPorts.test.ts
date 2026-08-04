import test from 'node:test';
import assert from 'node:assert/strict';

import * as portsMod from '../src/engine/midiPorts';
import * as lpMod from '../src/engine/launchpad';
import * as devMod from '../src/engine/launchpadDevice';

const ports = (portsMod as any).default ?? portsMod;
const lp = (lpMod as any).default ?? lpMod;
const dev = (devMod as any).default ?? devMod;

test('a claimed port is exclusive, and releasing gives it back', () => {
  ports.resetPortClaims();
  assert.equal(ports.isPortClaimed('a'), false);
  const release = ports.claimPort('a');
  assert.equal(ports.isPortClaimed('a'), true);
  assert.equal(ports.isPortClaimed('b'), false, 'claiming one port must not claim another');
  release();
  assert.equal(ports.isPortClaimed('a'), false);
});

test('claim changes notify listeners, so binding order does not matter', () => {
  // Generic MIDI may bind a port before the Launchpad claims it. Without a
  // notification it would keep hearing pad presses and enter a note for each.
  ports.resetPortClaims();
  let calls = 0;
  const stop = ports.onClaimsChanged(() => calls++);
  const release = ports.claimPort('a');
  assert.equal(calls, 1, 'claiming should notify');
  release();
  assert.equal(calls, 2, 'releasing should notify');
  stop();
  ports.claimPort('b');
  assert.equal(calls, 2, 'a removed listener must stop hearing');
  ports.resetPortClaims();
});

// --- port pairing ------------------------------------------------------------

const port = (id: string, name: string) => ({ id, name, state: 'connected' });

test('input and output are paired from the same physical device', () => {
  // Two Launchpads: taking the first matching input and the first matching
  // output independently can pair input A with output B, so presses come from
  // one device while lighting goes to the other -- and with different models
  // the SysEx device byte is taken from A and sent to B, where it means nothing.
  const access = {
    inputs: new Map([
      ['i1', port('i1', 'LPX MIDI In')],
      ['i2', port('i2', 'LPMiniMK3 MIDI In')],
    ]),
    // Deliberately the opposite order, which is what exposes the bug.
    outputs: new Map([
      ['o1', port('o1', 'LPMiniMK3 MIDI Out')],
      ['o2', port('o2', 'LPX MIDI Out')],
    ]),
  };
  const found = dev.findLaunchpadPorts(access);
  assert.ok(found, 'a pair should be found');
  assert.equal(found.model.id, 'x', 'the first usable input is the X');
  assert.equal(found.input.name, 'LPX MIDI In');
  assert.equal(found.output.name, 'LPX MIDI Out', 'the output must be the SAME device');
  assert.equal(
    lp.modelForPort(found.output.name).id,
    found.model.id,
    'the device byte we send must belong to the port we send it to'
  );
});

test('an input with no matching output of its own model is not used', () => {
  const access = {
    inputs: new Map([['i', port('i', 'LPX MIDI In')]]),
    outputs: new Map([['o', port('o', 'LPMiniMK3 MIDI Out')]]),
  };
  assert.equal(dev.findLaunchpadPorts(access), null, 'half a pair is not a device');
});

test('the DAW and DIN interfaces are still never paired', () => {
  const access = {
    inputs: new Map([['i', port('i', 'LPProMK3 DAW In')], ['i2', port('i2', 'LPProMK3 DIN In')]]),
    outputs: new Map([['o', port('o', 'LPProMK3 DAW Out')]]),
  };
  assert.equal(dev.findLaunchpadPorts(access), null);
});
