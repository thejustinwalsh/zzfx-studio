import { Song, SongConfig, Pattern, PatternLabel, PatternEffects, ChannelEffects, NoteEffect, SectionRole } from './types';
import { songToZzfxm } from './song';
import { generateSongName } from './songNames';

// Strip trailing zeros from number arrays for compact output
function fmtParams(arr: number[]): string {
  let last = arr.length - 1;
  while (last > 0 && (arr[last] === 0 || arr[last] === undefined)) last--;
  return '[' + arr.slice(0, last + 1).map(v => v == null ? '' : v).join(',') + ']';
}

function fmtParamsCompact(arr: number[]): string {
  let last = arr.length - 1;
  while (last > 0 && (arr[last] === 0 || arr[last] === undefined)) last--;
  return '[' + arr.slice(0, last + 1).map(v => v == null ? '' : +v.toFixed(4)).join(',') + ']';
}

function fmtChannel(ch: number[]): string {
  let last = ch.length - 1;
  while (last > 1 && ch[last] === 0) last--;
  return '[' + ch.slice(0, last + 1).join(',') + ']';
}

// Logical 4-channel arrays (for JSON embed / re-import)
function songToLogicalArrays(song: Song) {
  const patternArrays: number[][][] = [];
  for (const label of song.patternOrder) {
    patternArrays.push(song.patterns[label]);
  }
  return {
    instruments: song.instruments,
    patterns: patternArrays,
    sequence: song.sequence,
    bpm: song.config.bpm,
  };
}

function emptyPatternEffects(): PatternEffects {
  return [
    Array(32).fill(null),
    Array(32).fill(null),
    Array(32).fill(null),
    Array(32).fill(null),
  ] as PatternEffects;
}

// Strip trailing zeros from a number array
function trimZeros(arr: number[]): number[] {
  let last = arr.length - 1;
  while (last > 0 && (arr[last] === 0 || arr[last] === undefined)) last--;
  return arr.slice(0, last + 1);
}

// Strip trailing nulls from an effects array, keeping only non-null entries as {row, code, value}
function compactEffects(ch: (NoteEffect | null)[]): { r: number; c: string; v: number }[] {
  const out: { r: number; c: string; v: number }[] = [];
  for (let i = 0; i < ch.length; i++) {
    if (ch[i]) out.push({ r: i, c: ch[i]!.code, v: ch[i]!.value });
  }
  return out;
}

// Full Song → JSON for lossless round-trip (logical format with effects)
// Compacted: trailing zeros stripped from arrays, effects stored as sparse [{r,c,v}]
function songToJson(song: Song): string {
  const { instruments, patterns, sequence } = songToLogicalArrays(song);
  return JSON.stringify({
    v: 3,
    config: song.config,
    patternOrder: song.patternOrder,
    patternRoles: Object.fromEntries(
      song.patternOrder.map(l => [l, song.patternRoles[l]])
    ),
    instruments: instruments.map(trimZeros),
    patterns: patterns.map(pat => pat.map(trimZeros)),
    sequence,
    patternEffects: song.patternOrder.map(l => {
      const fx = song.patternEffects?.[l];
      if (!fx) return null;
      const compact = fx.map(compactEffects);
      // Skip entirely empty patterns
      if (compact.every(ch => ch.length === 0)) return null;
      return compact;
    }),
  });
}

// Minified self-contained player: zzfxG (v1.3.0 + filter), zzfxP, zzfxM (v2.0.3)
// Source: /tmp/zzfx-player.js → terser --compress passes=2 --mangle
// To re-minify: update /tmp/zzfx-player.js, run: npx terser zzfx-player.js --compress passes=2 --mangle
const ZZFX_PLAYER_MIN = 'const zzfxR=44100,zzfxX=new AudioContext;function zzfxP(...t){const n=zzfxX.createBuffer(t.length,t[0].length,44100),a=zzfxX.createBufferSource();return t.map((t,a)=>n.getChannelData(a).set(t)),a.buffer=n,a.connect(zzfxX.destination),a.start(),a}function zzfxG(t=1,n=.05,a=220,e=0,f=0,o=.1,h=0,r=1,z=0,s=0,c=0,M=0,i=0,u=0,x=0,l=0,g=0,m=1,d=0,X=0,b=0){const p=2*Math.PI,B=Math.abs,C=t=>t<0?-1:1;let G,P=z*=500*p/44100/44100,w=a*=(1+2*n*Math.random()-n)*p/44100,A=0,D=0,I=0,R=1,S=[],j=0,k=0,q=0;const v=p*B(b)*2/44100,y=Math.cos(v),E=Math.sin(v)/2/2,F=1+E,H=-2*y/F,J=(1-E)/F,K=(1+C(b)*y)/2/F,L=-(C(b)+y)/F,N=K;let O=0,Q=0,T=0,U=0;s*=500*p/44100**3,x*=p/44100,c*=p/44100,M*=44100,i=44100*i|0,t*=.3;const V=(e=44100*e||9)+(d*=44100)+(f*=44100)+(o*=44100)+(g*=44100)|0;for(;k<V;S[k++]=q*t)++I%(100*l|0)||(q=h?h>1?h>2?h>3?h>4?j/p%1<r/2?1:-1:Math.sin(j**3):Math.max(Math.min(Math.tan(j),1),-1):1-(2*j/p%2+2)%2:1-4*B(Math.round(j/p)-j/p):Math.sin(j),q=(i?1-X+X*Math.sin(p*k/i):1)*(h>4?q:C(q)*B(q)**r)*(k<e?k/e:k<e+d?1-(k-e)/d*(1-m):k<e+d+f?m:k<V-g?(V-k-g)/o*m:0),q=g?q/2+(g>k?0:(k<V-g?1:(V-k)/g)*S[k-g|0]/2/t):q,b&&(q=U=N*O+L*(O=Q)+K*(Q=q)-J*T-H*(T=U))),G=(a+=z+=s)*Math.cos(x*A++),j+=G+G*u*Math.sin(k**5),R&&++R>M&&(a+=c,w+=c,R=0),!i||++D%i||(a=w,z=P,R=R||1);return S}function zzfxM(t,n,a,e){let f,o,h,r,z,s,c,M,i,u,x,l,g,m,d,X=0,b=[],p=[],B=[],C=0,G=0,P=1,w={};const A=44100/e*60>>2;for(;P;C++)b=[P=M=x=g=0],a.map((e,x)=>{for(c=n[e][C]||[0,0,0],P|=n[e][C]?1:0,d=g+(n[e][0].length-2-(M?0:1))*A,m=x==a.length-1,o=2,r=g;o<c.length+(m?1:0);M=++o){for(z=c[o],i=o==c.length+(m?1:0)-1&&m||u!=(c[0]||0)||z||0,h=0;h<A&&M;h++>A-99&&i?l+=(l<1?1:0)/99:0)s=(1-l)*b[X++]/2||0,p[r]=(p[r]||0)-s*G+s,B[r]=(B[r++]||0)+s*G+s;z&&(l=z%1,G=c[1]||0,(z|=0)&&(b=w[[u=c[X=0]||0,z]]=w[[u,z]]||(f=[...t[u]],f[2]*=2**((z-12)/12),z>0?zzfxG(...f):[])))}g=d});return[p,B]}';

// Export a usable JS file — ready to drop into a game project
// Uses EXPANDED channels so ZzFXM playback includes effects.
// The @zzfx-studio line embeds full logical JSON for lossless re-import.
export function songToCode(song: Song): string {
  const expanded = songToZzfxm(song);

  const lines: string[] = [];

  // Machine-readable JSON for re-import (single line, stays out of the way)
  lines.push('// Generated by ZZFx Gen Studio');
  lines.push(`// @zzfx-studio ${songToJson(song)}`);
  lines.push('');

  // Self-contained player (minified zzfxG v1.3.0 + zzfxP + zzfxM v2.0.3)
  lines.push(ZZFX_PLAYER_MIN);
  lines.push('');

  // Human-readable song data (expanded channels for correct playback)
  lines.push('const instruments = [');
  for (const inst of expanded.instruments) {
    lines.push('  ' + fmtParams(inst) + ',');
  }
  lines.push('];');
  lines.push('');

  lines.push('const patterns = [');
  for (let pi = 0; pi < expanded.patterns.length; pi++) {
    const label = song.patternOrder[pi];
    const role = song.patternRoles[label];
    lines.push(`  [ // ${label} (${role})`);
    for (const ch of expanded.patterns[pi]) {
      lines.push('    ' + fmtChannel(ch) + ',');
    }
    lines.push('  ],');
  }
  lines.push('];');
  lines.push('');

  lines.push(`const sequence = [${expanded.sequence.join(',')}];`);
  lines.push(`const BPM = ${expanded.bpm};`);
  lines.push('');
  lines.push('// Ensure this runs after a user gesture (click/tap) — AudioContext requires interaction to start');
  lines.push('zzfxP(...zzfxM(instruments, patterns, sequence, BPM));');

  return lines.join('\n');
}

// Compact one-liner for clipboard (expanded for correct playback)
export function songToClipboard(song: Song): string {
  const expanded = songToZzfxm(song);

  const instStr = '[' + expanded.instruments.map(i => fmtParamsCompact(i)).join(',') + ']';
  const patStr = '[' + expanded.patterns.map(pat =>
    '[' + pat.map(ch => fmtChannel(ch)).join(',') + ']'
  ).join(',') + ']';
  const seqStr = '[' + expanded.sequence.join(',') + ']';

  return `zzfxM(${instStr},${patStr},${seqStr},${expanded.bpm})`;
}

// Import: parse the @zzfx-studio JSON line
export function codeToSong(code: string): Song | null {
  try {
    const match = code.match(/\/\/ @zzfx-studio (.+)/);
    if (!match) return null;

    const data = JSON.parse(match[1]);
    if (!data.config || !data.instruments || !data.patterns || !data.sequence) return null;

    const config: SongConfig = {
      ...data.config,
      name: data.config.name || generateSongName(data.config.vibe),
    };

    // Pad instruments back to 20 params
    for (const inst of data.instruments) {
      while (inst.length < 20) inst.push(0);
    }

    const patternOrder: PatternLabel[] = data.patternOrder;
    const patternRoles = {} as Record<PatternLabel, SectionRole>;
    const patternMap = {} as Record<PatternLabel, Pattern>;
    const patternEffects = {} as Record<PatternLabel, PatternEffects>;

    for (let i = 0; i < patternOrder.length; i++) {
      const label = patternOrder[i];
      patternRoles[label] = data.patternRoles?.[label] ?? 'verse';

      // Pad channels back to 34 (inst + pan + 32 notes)
      const pat = data.patterns[i];
      for (const ch of pat) {
        while (ch.length < 34) ch.push(0);
      }
      patternMap[label] = pat as Pattern;

      // Effects: v3 = sparse [{r,c,v}], v2 = dense [null|{code,value}], v1 = none
      const rawFx = data.patternEffects?.[i];
      if (data.v >= 3 && rawFx) {
        // Sparse format: each channel is array of {r, c, v}
        const expanded: PatternEffects = [
          Array(32).fill(null),
          Array(32).fill(null),
          Array(32).fill(null),
          Array(32).fill(null),
        ];
        for (let ch = 0; ch < 4; ch++) {
          if (rawFx[ch]) {
            for (const entry of rawFx[ch]) {
              expanded[ch][entry.r] = { code: entry.c, value: entry.v } as NoteEffect;
            }
          }
        }
        patternEffects[label] = expanded;
      } else if (data.v >= 2 && rawFx) {
        patternEffects[label] = rawFx as PatternEffects;
      } else {
        patternEffects[label] = emptyPatternEffects();
      }
    }

    return {
      config,
      instruments: data.instruments,
      patterns: patternMap,
      patternRoles,
      patternEffects,
      sequence: data.sequence,
      patternOrder,
    };
  } catch (e) {
    console.error('Failed to parse song:', e);
    return null;
  }
}
