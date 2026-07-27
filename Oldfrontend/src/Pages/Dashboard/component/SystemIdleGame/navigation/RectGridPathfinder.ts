export type RectGridBounds = {
  x: number;
  y: number;
  w: number;
  h: number;
};

export type RectGridBlocker = RectGridBounds;

export type RectGridPoint = {
  x: number;
  y: number;
};

type Node = {
  c: number;
  r: number;
  g: number;
  f: number;
  parent: Node | null;
};

const CELL = 32;
const BODY_PADDING = 8;
const MAX_ITERS = 4000;
const DIRS: Array<[number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, 1.414],
  [1, -1, 1.414],
  [-1, 1, 1.414],
  [-1, -1, 1.414],
];

export function findRectGridPath(
  bounds: RectGridBounds,
  blockers: RectGridBlocker[],
  from: RectGridPoint,
  to: RectGridPoint,
): [number, number][] {
  const cols = Math.ceil(bounds.w / CELL);
  const rows = Math.ceil(bounds.h / CELL);
  const inBounds = (c: number, r: number) => c >= 0 && r >= 0 && c < cols && r < rows;
  const toCell = (point: RectGridPoint) => ({
    c: Math.floor((point.x - bounds.x) / CELL),
    r: Math.floor((point.y - bounds.y) / CELL),
  });
  const toWorld = (c: number, r: number): RectGridPoint => ({
    x: bounds.x + c * CELL + CELL / 2,
    y: bounds.y + r * CELL + CELL / 2,
  });
  const blocked = (point: RectGridPoint) => blockers.some((rect) => pointInsideRect(point, rect, BODY_PADDING));
  const walkable = (c: number, r: number) => inBounds(c, r) && !blocked(toWorld(c, r));
  const nearest = (c0: number, r0: number): { c: number; r: number } | null => {
    for (let d = 0; d < 20; d += 1) {
      for (let dc = -d; dc <= d; dc += 1) {
        for (let dr = -d; dr <= d; dr += 1) {
          if (Math.abs(dc) !== d && Math.abs(dr) !== d) continue;
          const c = c0 + dc;
          const r = r0 + dr;
          if (walkable(c, r)) return { c, r };
        }
      }
    }
    return null;
  };

  let start = toCell(from);
  let end = toCell(to);
  let targetPoint = to;
  if (!inBounds(start.c, start.r) || !inBounds(end.c, end.r)) return [];

  if (!walkable(start.c, start.r)) {
    const next = nearest(start.c, start.r);
    if (!next) return [];
    start = next;
  }
  if (!walkable(end.c, end.r)) {
    const next = nearest(end.c, end.r);
    if (!next) return [];
    end = next;
    targetPoint = toWorld(end.c, end.r);
  }

  if (start.c === end.c && start.r === end.r) return [[targetPoint.x, targetPoint.y]];

  const key = (c: number, r: number) => `${c}:${r}`;
  const h = (c: number, r: number) => Math.abs(c - end.c) + Math.abs(r - end.r);
  const open = new Map<string, Node>();
  const closed = new Set<string>();
  open.set(key(start.c, start.r), { ...start, g: 0, f: h(start.c, start.r), parent: null });

  let iters = 0;
  while (open.size > 0 && iters < MAX_ITERS) {
    iters += 1;
    let current: Node | null = null;
    for (const node of open.values()) {
      if (!current || node.f < current.f) current = node;
    }
    if (!current) break;

    if (current.c === end.c && current.r === end.r) {
      const points: [number, number][] = [];
      let node: Node | null = current;
      while (node) {
        const world = toWorld(node.c, node.r);
        points.unshift([world.x, world.y]);
        node = node.parent;
      }
      points.push([targetPoint.x, targetPoint.y]);
      return simplify(points);
    }

    open.delete(key(current.c, current.r));
    closed.add(key(current.c, current.r));

    for (const [dc, dr, cost] of DIRS) {
      const c = current.c + dc;
      const r = current.r + dr;
      const nodeKey = key(c, r);
      if (!walkable(c, r) || closed.has(nodeKey)) continue;
      if (dc !== 0 && dr !== 0 && (!walkable(current.c + dc, current.r) || !walkable(current.c, current.r + dr))) {
        continue;
      }
      const g = current.g + cost;
      const existing = open.get(nodeKey);
      if (existing && existing.g <= g) continue;
      open.set(nodeKey, { c, r, g, f: g + h(c, r), parent: current });
    }
  }

  return [];
}

function pointInsideRect(point: RectGridPoint, rect: RectGridBlocker, padding: number): boolean {
  const left = rect.x - rect.w / 2 - padding;
  const right = rect.x + rect.w / 2 + padding;
  const top = rect.y - rect.h / 2 - padding;
  const bottom = rect.y + rect.h / 2 + padding;
  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

function simplify(points: [number, number][]): [number, number][] {
  if (points.length <= 2) return points;
  const result: [number, number][] = [points[0]];
  for (let i = 1; i < points.length - 1; i += 1) {
    const [ax, ay] = points[i - 1];
    const [bx, by] = points[i];
    const [cx, cy] = points[i + 1];
    const cross = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
    if (Math.abs(cross) > CELL * 0.5) result.push(points[i]);
  }
  result.push(points[points.length - 1]);
  return result;
}
