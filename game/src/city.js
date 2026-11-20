// Sunset Coast — the city itself. A deterministic grid town: avenues and streets,
// blocks of buildings, parks, a beach and sea along the south edge, a pier, and a
// fenced impound lot in The Docks. Everything is generated from one seeded random
// stream, so the same seed always builds the same city.
//
// Surfaces: road, sidewalk, grass, sand, water. Buildings, fences, water and the map
// edge are solid. The traffic AI and the renderer both read from here.

import { WORLD, DISTRICTS, SHOPS, SIDE } from './config.js';
import { range, rangeInt, pick, shuffle } from './random.js';

export const AVENUES = [480, 960, 1440, 1920, 2400, 2880, 3360];
export const STREETS = [360, 720, 1080, 1440, 1800, 2160, 2520];
export const AVENUE_HALF = 48;
export const STREET_HALF = 40;
export const SIDEWALK = 22;
export const SAND_Y = 2620;
export const WATER_Y = 2760;
export const PIER = { x0: 1860, x1: 1980, y0: 2740, y1: 2880 };

const ROOFS = ['#b0563f', '#4f6f8f', '#7a8a5a', '#9a8a6a', '#6a5a7a', '#8f6a4f'];

function blockRects() {
  const xs = [0, ...AVENUES, WORLD.width];
  const ys = [0, ...STREETS, WORLD.height];
  const blocks = [];
  for (let i = 0; i < xs.length - 1; i += 1) {
    for (let j = 0; j < ys.length - 1; j += 1) {
      const x0 = xs[i] + (i === 0 ? 0 : AVENUE_HALF + SIDEWALK);
      const x1 = xs[i + 1] - (i === xs.length - 2 ? 0 : AVENUE_HALF + SIDEWALK);
      const y0 = ys[j] + (j === 0 ? 0 : STREET_HALF + SIDEWALK);
      const y1 = ys[j + 1] - (j === ys.length - 2 ? 0 : STREET_HALF + SIDEWALK);
      if (x1 - x0 > 90 && y1 - y0 > 90) blocks.push({ x0, y0, x1, y1 });
    }
  }
  return blocks;
}

function districtAt(x, y) {
  for (const d of DISTRICTS) {
    if (x >= d.x0 && x < d.x1 && y >= d.y0 && y < d.y1) return d.name;
  }
  return 'Marina Bay';
}

export function createCity(rng) {
  const roads = [];
  for (const x of AVENUES) roads.push({ vertical: true, at: x, half: AVENUE_HALF, from: 0, to: WORLD.height });
  for (const y of STREETS) roads.push({ vertical: false, at: y, half: STREET_HALF, from: 0, to: WORLD.width });

  const buildings = [];
  const parks = [];
  const trees = [];
  const lamps = [];
  const parcels = [];

  const shopClear = SHOPS.map((s) => ({ x: s.x, y: s.y, r: 150 }));
  const impound = { x0: 3000, y0: 1900, x1: 3360, y1: 2160, gateX0: 3120, gateX1: 3200 };
  const fences = [
    // North wall with a gate gap, then east, south and west walls.
    { x: impound.x0, y: impound.y0 - 6, w: impound.gateX0 - impound.x0, h: 12 },
    { x: impound.gateX1, y: impound.y0 - 6, w: impound.x1 - impound.gateX1, h: 12 },
    { x: impound.x1 - 6, y: impound.y0, w: 12, h: impound.y1 - impound.y0 },
    { x: impound.x0, y: impound.y1 - 6, w: impound.x1 - impound.x0, h: 12 },
    { x: impound.x0 - 6, y: impound.y0, w: 12, h: impound.y1 - impound.y0 },
  ];

  const blocks = blockRects();
  const parkBlocks = shuffle(rng, blocks.filter((b) => b.y1 < SAND_Y - 40)).slice(0, 6);
  const parkSet = new Set(parkBlocks);

  for (const b of blocks) {
    if (b.y0 >= SAND_Y - 40) continue; // beach band: no buildings
    if (b.x0 >= impound.x0 - 20 && b.x1 <= impound.x1 + 20 && b.y0 >= impound.y0 - 20 && b.y1 <= impound.y1 + 20) {
      continue; // the impound lot stays open
    }
    if (parkSet.has(b)) {
      parks.push({ x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 });
      const treeCount = Math.floor(((b.x1 - b.x0) * (b.y1 - b.y0)) / 9000);
      for (let i = 0; i < treeCount; i += 1) {
        trees.push({ x: range(rng, b.x0 + 26, b.x1 - 26), y: range(rng, b.y0 + 26, b.y1 - 26), r: range(rng, 10, 15) });
      }
      continue;
    }
    const nearShop = shopClear.some((s) => {
      const cx = Math.max(b.x0, Math.min(s.x, b.x1));
      const cy = Math.max(b.y0, Math.min(s.y, b.y1));
      return Math.hypot(cx - s.x, cy - s.y) < s.r;
    });
    const count = nearShop ? 1 : rangeInt(rng, 1, 3);
    const tall = districtAt((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2) === 'Neon Row';
    for (let i = 0; i < count; i += 1) {
      const w = range(rng, 110, Math.min(240, b.x1 - b.x0 - 60));
      const h = range(rng, 90, Math.min(200, b.y1 - b.y0 - 60));
      const x = range(rng, b.x0 + 30, b.x1 - 30 - w);
      const y = range(rng, b.y0 + 30, b.y1 - 30 - h);
      const clear = shopClear.some((s) => Math.hypot(x + w / 2 - s.x, y + h / 2 - s.y) < s.r);
      if (clear) continue;
      buildings.push({
        x, y, w, h,
        hgt: tall ? range(rng, 18, 30) : range(rng, 8, 18),
        color: pick(rng, ROOFS),
        roof: rng() < 0.25,
      });
    }
  }

  // Street trees along the sidewalks and lamps at every intersection.
  for (const x of AVENUES) {
    for (const y of STREETS) {
      lamps.push({ x: x + AVENUE_HALF + 8, y: y - STREET_HALF - 8 });
      if (rng() < 0.7) trees.push({ x: x - AVENUE_HALF - 10, y: y + STREET_HALF + 26, r: range(rng, 9, 13) });
      if (rng() < 0.7) trees.push({ x: x + AVENUE_HALF + 10, y: y + STREET_HALF + 26, r: range(rng, 9, 13) });
    }
  }
  // Palms along the beach.
  for (let x = 120; x < WORLD.width; x += 150) {
    if (rng() < 0.75) trees.push({ x: x + range(rng, -30, 30), y: SAND_Y + range(rng, 18, 55), r: range(rng, 11, 15), palm: true });
  }

  // Hidden parcels: sidewalks, parks and the beach.
  let guard = 0;
  while (parcels.length < SIDE.parcelCount && guard < 600) {
    guard += 1;
    let x;
    let y;
    const roll = rng();
    if (roll < 0.45) {
      const vertical = rng() < 0.5;
      if (vertical) {
        x = pick(rng, AVENUES) + (rng() < 0.5 ? -1 : 1) * (AVENUE_HALF + SIDEWALK / 2);
        y = range(rng, 60, SAND_Y - 60);
      } else {
        x = range(rng, 60, WORLD.width - 60);
        y = pick(rng, STREETS) + (rng() < 0.5 ? -1 : 1) * (STREET_HALF + SIDEWALK / 2);
      }
    } else if (roll < 0.75 && parks.length > 0) {
      const p = pick(rng, parks);
      x = range(rng, p.x0 + 20, p.x1 - 20);
      y = range(rng, p.y0 + 20, p.y1 - 20);
    } else {
      x = range(rng, 80, WORLD.width - 80);
      y = range(rng, SAND_Y + 20, WATER_Y - 30);
    }
    if (parcels.some((p) => Math.hypot(p.x - x, p.y - y) < 130)) continue;
    if (solidPoint(x, y)) continue;
    parcels.push({ x, y, taken: false });
  }

  function solidPoint(x, y) {
    if (x < 0 || y < 0 || x >= WORLD.width || y >= WORLD.height) return true;
    if (y >= WATER_Y && !(x >= PIER.x0 && x <= PIER.x1 && y >= PIER.y0)) return true;
    for (const b of buildings) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return true;
    }
    for (const f of fences) {
      if (x >= f.x && x <= f.x + f.w && y >= f.y && y <= f.y + f.h) return true;
    }
    return false;
  }

  /** Push a circle out of every solid it overlaps; returns the corrected position
   *  and the normal of the last push (for killing velocity into the wall). */
  function resolveCircle(x, y, r) {
    let hit = false;
    let nx = 0;
    let ny = 0;
    for (let pass = 0; pass < 3; pass += 1) {
      let moved = false;
      // Map edge.
      if (x < r) { x = r; nx = 1; ny = 0; moved = true; }
      if (x > WORLD.width - r) { x = WORLD.width - r; nx = -1; ny = 0; moved = true; }
      if (y < r) { y = r; nx = 0; ny = 1; moved = true; }
      if (y > WORLD.height - r) { y = WORLD.height - r; nx = 0; ny = -1; moved = true; }
      // Water (the pier deck is walkable).
      const onPier = x >= PIER.x0 && x <= PIER.x1 && y >= PIER.y0;
      if (y + r > WATER_Y && !onPier) {
        y = WATER_Y - r;
        nx = 0;
        ny = -1;
        moved = true;
        hit = true;
      }
      for (const b of buildings) {
        const cx = Math.max(b.x, Math.min(x, b.x + b.w));
        const cy = Math.max(b.y, Math.min(y, b.y + b.h));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            x = cx + nx * r;
            y = cy + ny * r;
          } else {
            nx = 0;
            ny = -1;
            y = b.y - r;
          }
          moved = true;
          hit = true;
        }
      }
      for (const f of fences) {
        const cx = Math.max(f.x, Math.min(x, f.x + f.w));
        const cy = Math.max(f.y, Math.min(y, f.y + f.h));
        const dx = x - cx;
        const dy = y - cy;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          if (d2 > 0.0001) {
            const d = Math.sqrt(d2);
            nx = dx / d;
            ny = dy / d;
            x = cx + nx * r;
            y = cy + ny * r;
          } else {
            nx = 0;
            ny = -1;
            y = f.y - r;
          }
          moved = true;
          hit = true;
        }
      }
      if (!moved) break;
    }
    return { x, y, hit, nx, ny };
  }

  function surfaceAt(x, y) {
    if (y >= WATER_Y) return (x >= PIER.x0 && x <= PIER.x1 && y >= PIER.y0) ? 'pier' : 'water';
    if (y >= SAND_Y) return 'sand';
    for (const p of parks) {
      if (x >= p.x0 && x <= p.x1 && y >= p.y0 && y <= p.y1) return 'grass';
    }
    for (const road of roads) {
      if (road.vertical) {
        if (Math.abs(x - road.at) <= road.half && y >= road.from && y <= road.to) return 'road';
      } else if (Math.abs(y - road.at) <= road.half && x >= road.from && x <= road.to) {
        return 'road';
      }
    }
    for (const road of roads) {
      if (road.vertical) {
        if (Math.abs(x - road.at) <= road.half + SIDEWALK && y >= road.from && y <= road.to) return 'sidewalk';
      } else if (Math.abs(y - road.at) <= road.half + SIDEWALK && x >= road.from && x <= road.to) {
        return 'sidewalk';
      }
    }
    return 'grass';
  }

  function nearestRoadPoint(x, y) {
    let best = null;
    let bestD = Infinity;
    for (const road of roads) {
      let px;
      let py;
      if (road.vertical) {
        px = road.at;
        py = Math.max(road.from, Math.min(y, road.to));
      } else {
        px = Math.max(road.from, Math.min(x, road.to));
        py = road.at;
      }
      const d = Math.hypot(px - x, py - y);
      if (d < bestD) {
        bestD = d;
        best = { x: px, y: py, vertical: road.vertical, angle: road.vertical ? Math.PI / 2 : 0 };
      }
    }
    return best;
  }

  function randomRoadPoint(rngFn) {
    const road = pick(rngFn, roads);
    if (road.vertical) return { x: road.at, y: range(rngFn, 80, WORLD.height - 80), vertical: true, angle: Math.PI / 2 };
    return { x: range(rngFn, 80, WORLD.width - 80), y: road.at, vertical: false, angle: 0 };
  }

  function randomSidewalkPoint(rngFn) {
    const road = pick(rngFn, roads);
    const side = rngFn() < 0.5 ? -1 : 1;
    if (road.vertical) {
      return { x: road.at + side * (road.half + SIDEWALK / 2), y: range(rngFn, 80, SAND_Y - 80) };
    }
    return { x: range(rngFn, 80, WORLD.width - 80), y: road.at + side * (road.half + SIDEWALK / 2) };
  }

  return {
    width: WORLD.width,
    height: WORLD.height,
    roads,
    buildings,
    parks,
    trees,
    lamps,
    parcels,
    fences,
    impound,
    shops: SHOPS,
    districtAt,
    surfaceAt,
    solidPoint,
    resolveCircle,
    nearestRoadPoint,
    randomRoadPoint,
    randomSidewalkPoint,
  };
}
