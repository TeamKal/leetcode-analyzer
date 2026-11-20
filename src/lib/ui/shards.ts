/**
 * Glass-style fracture geometry: a triangle mesh with extra detail around the
 * impact points (like a real crack pattern), built with a Bowyer-Watson
 * Delaunay triangulation. No imports, so it is testable.
 */

export type Point = { x: number; y: number };
export type Triangle = [Point, Point, Point];

/** Small seeded random generator, so a shatter is reproducible in tests. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Delaunay triangulation of the points (Bowyer-Watson). Returns index triples. */
export function triangulate(points: Point[]): Array<[number, number, number]> {
  const n = points.length;
  if (n < 3) return [];
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const d = Math.max(maxX - minX, maxY - minY, 1) * 20;
  const mx = (minX + maxX) / 2;
  const my = (minY + maxY) / 2;
  // A super triangle that holds every point.
  const all: Point[] = [
    ...points,
    { x: mx - d, y: my - d },
    { x: mx, y: my + d },
    { x: mx + d, y: my - d },
  ];

  type Tri = { a: number; b: number; c: number; cx: number; cy: number; r2: number };
  const make = (a: number, b: number, c: number): Tri => {
    const A = all[a];
    const B = all[b];
    const C = all[c];
    const dd = 2 * (A.x * (B.y - C.y) + B.x * (C.y - A.y) + C.x * (A.y - B.y)) || 1e-9;
    const ux =
      ((A.x ** 2 + A.y ** 2) * (B.y - C.y) +
        (B.x ** 2 + B.y ** 2) * (C.y - A.y) +
        (C.x ** 2 + C.y ** 2) * (A.y - B.y)) /
      dd;
    const uy =
      ((A.x ** 2 + A.y ** 2) * (C.x - B.x) +
        (B.x ** 2 + B.y ** 2) * (A.x - C.x) +
        (C.x ** 2 + C.y ** 2) * (B.x - A.x)) /
      dd;
    return { a, b, c, cx: ux, cy: uy, r2: (A.x - ux) ** 2 + (A.y - uy) ** 2 };
  };

  let tris: Tri[] = [make(n, n + 1, n + 2)];
  for (let i = 0; i < n; i += 1) {
    const p = all[i];
    const bad: Tri[] = [];
    const keep: Tri[] = [];
    for (const t of tris) {
      if ((p.x - t.cx) ** 2 + (p.y - t.cy) ** 2 < t.r2 - 1e-9) bad.push(t);
      else keep.push(t);
    }
    // The boundary of the hole: edges used by exactly one bad triangle.
    const edges = new Map<string, [number, number, number]>();
    for (const t of bad) {
      for (const [u, v] of [
        [t.a, t.b],
        [t.b, t.c],
        [t.c, t.a],
      ] as Array<[number, number]>) {
        const key = u < v ? `${u}_${v}` : `${v}_${u}`;
        const seen = edges.get(key);
        edges.set(key, [u, v, (seen ? seen[2] : 0) + 1]);
      }
    }
    tris = keep;
    for (const [u, v, count] of edges.values()) {
      if (count === 1) tris.push(make(u, v, i));
    }
  }
  return tris.filter((t) => t.a < n && t.b < n && t.c < n).map((t) => [t.a, t.b, t.c]);
}

export type ShardOptions = {
  width: number;
  height: number;
  /** Impact points (viewport pixels). */
  impacts: Point[];
  seed?: number;
  /** Spacing of the plain grid away from the impacts. */
  cell?: number;
};

/** Points for the mesh: a jittered grid plus rings of tighter points around each impact. */
export function fracturePoints({ width, height, impacts, seed = 7, cell = 120 }: ShardOptions) {
  const rand = seeded(seed);
  const pts: Point[] = [
    { x: 0, y: 0 },
    { x: width, y: 0 },
    { x: 0, y: height },
    { x: width, y: height },
  ];
  // The border, so the mesh covers the whole screen exactly.
  for (let x = cell; x < width; x += cell) {
    pts.push({ x: x + (rand() - 0.5) * cell * 0.3, y: 0 }, { x: x + (rand() - 0.5) * cell * 0.3, y: height });
  }
  for (let y = cell; y < height; y += cell) {
    pts.push({ x: 0, y: y + (rand() - 0.5) * cell * 0.3 }, { x: width, y: y + (rand() - 0.5) * cell * 0.3 });
  }
  for (let y = cell; y < height - cell * 0.5; y += cell) {
    for (let x = cell; x < width - cell * 0.5; x += cell) {
      pts.push({ x: x + (rand() - 0.5) * cell * 0.8, y: y + (rand() - 0.5) * cell * 0.8 });
    }
  }
  const inside = (p: Point) => p.x > 2 && p.x < width - 2 && p.y > 2 && p.y < height - 2;
  for (const c of impacts) {
    for (const [r, count] of [
      [26, 6],
      [62, 8],
      [118, 11],
      [200, 14],
    ] as Array<[number, number]>) {
      for (let k = 0; k < count; k += 1) {
        const a = ((k + rand() * 0.7) / count) * Math.PI * 2;
        const rr = r * (0.8 + rand() * 0.4);
        const p = { x: c.x + Math.cos(a) * rr, y: c.y + Math.sin(a) * rr };
        if (inside(p)) pts.push(p);
      }
    }
  }
  return pts;
}

export type Shard = {
  tri: Triangle;
  centroid: Point;
  /** Index of the nearest impact, or -1 if there are none. */
  impact: number;
  /** Distance to that impact. */
  distance: number;
};

export function buildShards(options: ShardOptions): Shard[] {
  const points = fracturePoints(options);
  const triangles = triangulate(points);
  return triangles.map(([a, b, c]) => {
    const tri: Triangle = [points[a], points[b], points[c]];
    const centroid = {
      x: (tri[0].x + tri[1].x + tri[2].x) / 3,
      y: (tri[0].y + tri[1].y + tri[2].y) / 3,
    };
    let impact = -1;
    let distance = Infinity;
    options.impacts.forEach((p, i) => {
      const d = Math.hypot(centroid.x - p.x, centroid.y - p.y);
      if (d < distance) {
        distance = d;
        impact = i;
      }
    });
    return { tri, centroid, impact, distance };
  });
}
