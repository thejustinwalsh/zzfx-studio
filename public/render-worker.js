'use strict';

const zzfxR = 44100;

function zzfxG(
  volume, randomness, frequency, attack, sustain, release, shape,
  shapeCurve, slide, deltaSlide, pitchJump, pitchJumpTime, repeatTime,
  noise, modulation, bitCrush, delay, sustainVolume, decay, tremolo, filter
) {
  if (volume === undefined) volume = 1;
  if (randomness === undefined) randomness = 0.05;
  if (frequency === undefined) frequency = 220;
  if (attack === undefined) attack = 0;
  if (sustain === undefined) sustain = 0;
  if (release === undefined) release = 0.1;
  if (shape === undefined) shape = 0;
  if (shapeCurve === undefined) shapeCurve = 1;
  if (slide === undefined) slide = 0;
  if (deltaSlide === undefined) deltaSlide = 0;
  if (pitchJump === undefined) pitchJump = 0;
  if (pitchJumpTime === undefined) pitchJumpTime = 0;
  if (repeatTime === undefined) repeatTime = 0;
  if (noise === undefined) noise = 0;
  if (modulation === undefined) modulation = 0;
  if (bitCrush === undefined) bitCrush = 0;
  if (delay === undefined) delay = 0;
  if (sustainVolume === undefined) sustainVolume = 1;
  if (decay === undefined) decay = 0;
  if (tremolo === undefined) tremolo = 0;
  if (filter === undefined) filter = 0;

  var sampleRate = zzfxR;
  var PI2 = Math.PI * 2;
  var abs = Math.abs;
  var sign = function(v) { return v < 0 ? -1 : 1; };

  var startSlide = (slide *= (500 * PI2) / sampleRate / sampleRate);
  var startFrequency = (frequency *=
    ((1 + randomness * 2 * Math.random() - randomness) * PI2) / sampleRate);
  var modOffset = 0;
  var repeat = 0;
  var crush = 0;
  var jump = 1;
  var b = [];
  var t = 0;
  var i = 0;
  var s = 0;
  var f;

  var quality = 2;
  var w = PI2 * abs(filter) * 2 / sampleRate;
  var cos = Math.cos(w);
  var alpha = Math.sin(w) / 2 / quality;
  var a0 = 1 + alpha;
  var a1 = -2 * cos / a0;
  var a2 = (1 - alpha) / a0;
  var b0 = (1 + sign(filter) * cos) / 2 / a0;
  var b1 = -(sign(filter) + cos) / a0;
  var b2 = b0;
  var x2 = 0, x1 = 0, y2 = 0, y1 = 0;

  var minAttack = 9;
  attack = attack * sampleRate || minAttack;
  decay *= sampleRate;
  sustain *= sampleRate;
  release *= sampleRate;
  delay *= sampleRate;
  deltaSlide *= (500 * PI2) / Math.pow(sampleRate, 3);
  modulation *= PI2 / sampleRate;
  pitchJump *= PI2 / sampleRate;
  pitchJumpTime *= sampleRate;
  repeatTime = (repeatTime * sampleRate) | 0;
  volume *= 0.3;

  var length = (attack + decay + sustain + release + delay) | 0;

  for (; i < length; b[i++] = s * volume) {
    if (!(++crush % ((bitCrush * 100) | 0))) {
      s = shape
        ? shape > 1
          ? shape > 2
            ? shape > 3
              ? shape > 4
                ? (t / PI2 % 1 < shapeCurve / 2 ? 1 : -1)
                : Math.sin(Math.pow(t, 3))
              : Math.max(Math.min(Math.tan(t), 1), -1)
            : 1 - (((2 * t) / PI2) % 2 + 2) % 2
          : 1 - 4 * abs(Math.round(t / PI2) - t / PI2)
        : Math.sin(t);

      s =
        (repeatTime
          ? 1 - tremolo + tremolo * Math.sin((PI2 * i) / repeatTime)
          : 1) *
        (shape > 4 ? s : sign(s) * Math.pow(abs(s), shapeCurve)) *
        (i < attack
          ? i / attack
          : i < attack + decay
            ? 1 - ((i - attack) / decay) * (1 - sustainVolume)
            : i < attack + decay + sustain
              ? sustainVolume
              : i < length - delay
                ? ((length - i - delay) / release) * sustainVolume
                : 0);

      s = delay
        ? s / 2 +
          (delay > i
            ? 0
            : ((i < length - delay ? 1 : (length - i) / delay) *
                b[(i - delay) | 0]) /
              2 /
              volume)
        : s;

      if (filter)
        s = y1 = b2 * x2 + b1 * (x2 = x1) + b0 * (x1 = s) - a2 * y2 - a1 * (y2 = y1);
    }

    f = (frequency += slide += deltaSlide) * Math.cos(modulation * modOffset++);
    t += f + f * noise * Math.sin(Math.pow(i, 5));

    if (jump && ++jump > pitchJumpTime) {
      frequency += pitchJump;
      startFrequency += pitchJump;
      jump = 0;
    }

    if (repeatTime && !(++repeat % repeatTime)) {
      frequency = startFrequency;
      slide = startSlide;
      jump = jump || 1;
    }
  }

  return b;
}

function zzfxMChannels(instruments, patterns, sequence, BPM) {
  if (BPM === undefined) BPM = 125;
  var beatLength = (zzfxR / BPM) * 60 >> 2;

  var channelCount = 0;
  for (var pi = 0; pi < patterns.length; pi++) {
    channelCount = Math.max(channelCount, patterns[pi].length);
  }
  if (channelCount === 0) return [];

  var maxPatternSteps = patterns[0][0].length - 2;
  var totalSamples = ((sequence.length - 1) * maxPatternSteps + (maxPatternSteps - 1)) * beatLength;

  var channelBuffers = [];
  for (var ch = 0; ch < channelCount; ch++) {
    channelBuffers.push([new Float32Array(totalSamples), new Float32Array(totalSamples)]);
  }

  var sampleCache = {};

  for (var channelIndex = 0; channelIndex < channelCount; channelIndex++) {
    var sampleBuffer = [];
    var sampleOffset = 0;
    var notFirstBeat = 0;
    var instrument = 0;
    var panning = 0;
    var attenuation = 0;
    var outSampleOffset = 0;

    var leftBuf = channelBuffers[channelIndex][0];
    var rightBuf = channelBuffers[channelIndex][1];

    for (var seqIdx = 0; seqIdx < sequence.length; seqIdx++) {
      var patternIndex = sequence[seqIdx];
      var patternChannel = patterns[patternIndex][channelIndex] || [0, 0, 0];
      var nextSampleOffset = outSampleOffset +
        (patternChannel.length - 2 - (notFirstBeat ? 0 : 1)) * beatLength;
      var isSequenceEnd = seqIdx === sequence.length - 1;

      var k = outSampleOffset;

      for (
        var i = 2;
        i < patternChannel.length + (isSequenceEnd ? 1 : 0);
        notFirstBeat = ++i
      ) {
        var note = patternChannel[i];

        var stop =
          (i === patternChannel.length + (isSequenceEnd ? 1 : 0) - 1 &&
            isSequenceEnd) ||
          instrument !== (patternChannel[0] || 0) ||
          note ||
          0;

        for (
          var j = 0;
          j < beatLength && notFirstBeat;
          j++ > beatLength - 99 && stop
            ? (attenuation += (attenuation < 1 ? 1 : 0) / 99)
            : 0
        ) {
          var sample = ((1 - attenuation) * (sampleBuffer[sampleOffset++] || 0)) / 2 || 0;
          leftBuf[k] = (leftBuf[k] || 0) - sample * panning + sample;
          rightBuf[k] = (rightBuf[k] || 0) + sample * panning + sample;
          k++;
        }

        if (note) {
          attenuation = note % 1;
          panning = patternChannel[1] || 0;
          var noteInt = note | 0;
          if (noteInt) {
            var cacheKey = (instrument = patternChannel[(sampleOffset = 0)] || 0) + ',' + noteInt;
            sampleBuffer = sampleCache[cacheKey] = sampleCache[cacheKey] || (function() {
              var instrumentParameters = instruments[instrument].slice();
              instrumentParameters[2] *= Math.pow(2, (noteInt - 12) / 12);
              return noteInt > 0 ? zzfxG.apply(null, instrumentParameters) : [];
            })();
          }
        }
      }

      outSampleOffset = nextSampleOffset;
    }
  }

  return channelBuffers;
}

function applyEffect(baseParams, effect) {
  var p = baseParams.slice();
  var v = effect.value;
  switch (effect.code) {
    case 'SU': p[8] = (v / 255) * 0.8; break;
    case 'SD': p[8] = -(v / 255) * 0.8; break;
    case 'VB': {
      var speed = (v >> 4) || 1;
      var depth = (v & 0xF) || 1;
      p[12] = 0.05 + (16 - speed) * 0.02;
      p[19] = (depth / 15) * 0.5;
      break;
    }
    case 'DT': p[7] = v === 1 ? 0.25 : v === 2 ? 0.5 : 1.0; break;
    case 'ST': {
      var factor = 1 - (v / 255) * 0.85;
      p[4] *= factor;
      p[5] *= factor;
      break;
    }
    case 'PD':
      p[10] = -(v / 255) * 40;
      p[11] = 0.005 + (v / 255) * 0.02;
      break;
    case 'BC': p[15] = (v / 255) * 1; break;
    case 'TR': {
      var tSpeed = (v >> 4) || 1;
      var tDepth = (v & 0xF) || 1;
      p[12] = 0.04 + (16 - tSpeed) * 0.015;
      p[19] = (tDepth / 15) * 0.7;
      break;
    }
  }
  return p;
}

function expandSong(song) {
  var ROWS = 32;
  var hasEffects = song.patternEffects &&
    Object.keys(song.patternEffects).length > 0;

  if (!hasEffects) {
    var patternArrays = [];
    for (var li = 0; li < song.patternOrder.length; li++) {
      patternArrays.push(song.patterns[song.patternOrder[li]].slice());
    }
    return {
      instruments: song.instruments.slice(),
      patterns: patternArrays,
      sequence: song.sequence,
      bpm: song.config.bpm,
      channelMap: [0, 1, 2, 3],
    };
  }

  var effectKeys = new Map();
  for (var li2 = 0; li2 < song.patternOrder.length; li2++) {
    var label = song.patternOrder[li2];
    var effects = song.patternEffects[label];
    if (!effects) continue;
    for (var ch = 0; ch < 4; ch++) {
      if (!effects[ch]) continue;
      for (var ri = 0; ri < effects[ch].length; ri++) {
        var fx = effects[ch][ri];
        if (!fx) continue;
        var key = ch + '_' + fx.code + '_' + fx.value;
        if (!effectKeys.has(key)) {
          effectKeys.set(key, { logicalCh: ch, effect: fx });
        }
      }
    }
  }

  if (effectKeys.size === 0) {
    var patternArrays2 = [];
    for (var li3 = 0; li3 < song.patternOrder.length; li3++) {
      patternArrays2.push(song.patterns[song.patternOrder[li3]].slice());
    }
    return {
      instruments: song.instruments.slice(),
      patterns: patternArrays2,
      sequence: song.sequence,
      bpm: song.config.bpm,
      channelMap: [0, 1, 2, 3],
    };
  }

  var expandedInstruments = song.instruments.map(function(inst) { return inst.slice(); });
  var effectInstMap = new Map();

  effectKeys.forEach(function(val, key) {
    var variant = applyEffect(song.instruments[val.logicalCh].slice(), val.effect);
    effectInstMap.set(key, expandedInstruments.length);
    expandedInstruments.push(variant);
  });

  var channelMap = [0, 1, 2, 3];
  var effectPhysMap = new Map();

  effectKeys.forEach(function(val, key) {
    effectPhysMap.set(key, channelMap.length);
    channelMap.push(val.logicalCh);
  });

  var physicalChannelCount = channelMap.length;
  var expandedPatterns = [];

  for (var li4 = 0; li4 < song.patternOrder.length; li4++) {
    var label2 = song.patternOrder[li4];
    var pattern = song.patterns[label2];
    var effects2 = song.patternEffects ? song.patternEffects[label2] : null;

    var physPattern = [];
    for (var p = 0; p < physicalChannelCount; p++) {
      var logCh = channelMap[p];
      var arr = new Array(ROWS + 2);
      arr[0] = p < 4 ? pattern[logCh][0] : 0;
      arr[1] = pattern[logCh][1];
      for (var z = 2; z < ROWS + 2; z++) arr[z] = 0;
      physPattern.push(arr);
    }

    for (var ch2 = 0; ch2 < 4; ch2++) {
      var channelData = pattern[ch2];
      var channelEffects = effects2 ? effects2[ch2] : null;

      for (var row = 0; row < ROWS; row++) {
        var note = channelData[row + 2];
        if (note <= 0) continue;
        var fx2 = channelEffects ? channelEffects[row] : null;
        if (fx2) {
          var key2 = ch2 + '_' + fx2.code + '_' + fx2.value;
          var physIdx = effectPhysMap.get(key2);
          var instIdx = effectInstMap.get(key2);
          physPattern[physIdx][0] = instIdx;
          physPattern[physIdx][row + 2] = note;
        } else {
          physPattern[ch2][row + 2] = note;
        }
      }
    }

    expandedPatterns.push(physPattern);
  }

  return {
    instruments: expandedInstruments,
    patterns: expandedPatterns,
    sequence: song.sequence,
    bpm: song.config.bpm,
    channelMap: channelMap,
  };
}

function mixToLogical(physicalBuffers, channelMap) {
  if (physicalBuffers.length === 0) return [];
  var sampleLength = physicalBuffers[0][0].length;
  var logical = [];
  for (var ch = 0; ch < 4; ch++) {
    logical.push([new Float32Array(sampleLength), new Float32Array(sampleLength)]);
  }
  for (var p = 0; p < physicalBuffers.length; p++) {
    var logCh = channelMap[p];
    if (logCh === undefined || logCh < 0 || logCh > 3) continue;
    var pLeft = physicalBuffers[p][0];
    var pRight = physicalBuffers[p][1];
    var lLeft = logical[logCh][0];
    var lRight = logical[logCh][1];
    for (var i = 0; i < sampleLength; i++) {
      lLeft[i] += pLeft[i] || 0;
      lRight[i] += pRight[i] || 0;
    }
  }
  return logical;
}

function renderSongBuffers(song) {
  var expanded = expandSong(song);
  var physicalBuffers = zzfxMChannels(
    expanded.instruments, expanded.patterns, expanded.sequence, expanded.bpm
  );
  if (physicalBuffers.length === 0) return [];
  return mixToLogical(physicalBuffers, expanded.channelMap);
}

self.onmessage = function(e) {
  var msg = e.data;
  if (msg.type === 'render') {
    var buffers = renderSongBuffers(msg.song);
    var transferable = [];
    var result = [];
    for (var i = 0; i < buffers.length; i++) {
      var left = buffers[i][0] instanceof Float32Array ? buffers[i][0] : new Float32Array(buffers[i][0]);
      var right = buffers[i][1] instanceof Float32Array ? buffers[i][1] : new Float32Array(buffers[i][1]);
      result.push([left, right]);
      transferable.push(left.buffer, right.buffer);
    }
    self.postMessage({ type: 'result', id: msg.id, buffers: result }, transferable);
  }
};
