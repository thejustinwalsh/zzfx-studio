// Bjorklund algorithm — distributes hits evenly across steps
export function euclidean(hits: number, steps: number, rotation: number = 0): number[] {
  if (hits <= 0) return Array(steps).fill(0);
  if (hits >= steps) return Array(steps).fill(1);

  let groups: number[][] = Array.from({ length: hits }, () => [1])
    .concat(Array.from({ length: steps - hits }, () => [0]));

  while (true) {
    const remainder = groups.length - hits;
    if (remainder <= 1) break;
    const toDistribute = Math.min(hits, remainder);
    const newGroups: number[][] = [];
    for (let i = 0; i < toDistribute; i++) {
      newGroups.push([...groups[i], ...groups[hits + i]]);
    }
    for (let i = toDistribute; i < hits; i++) {
      newGroups.push(groups[i]);
    }
    for (let i = hits + toDistribute; i < groups.length; i++) {
      newGroups.push(groups[i]);
    }
    hits = toDistribute < hits ? hits : toDistribute;
    groups = newGroups;
    if (groups.length <= hits + 1) break;
  }

  const pattern = groups.flat();
  if (rotation > 0) {
    const r = rotation % pattern.length;
    return [...pattern.slice(r), ...pattern.slice(0, r)];
  }
  return pattern;
}
