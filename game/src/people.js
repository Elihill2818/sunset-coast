// Pedestrians: people on the sidewalks. They stroll between sidewalk points, scatter
// when a fast car or a police chase comes near, and get knocked down when a car hits
// them — which the whole street notices. Kept deliberately simple: a walker with a
// target point, a flee state, and a down state. No pathfinding, no stuck states.

import { PEOPLE } from './config.js';
import { range, pick } from './random.js';

const SHIRTS = ['#e2e2e2', '#3e7be2', '#e2543e', '#f2c94c', '#7ec850', '#9b59d0', '#e28a3e', '#39c0c8'];
const SKINS = ['#e8b98a', '#c98d5f', '#8a5a3b', '#f0c8a0', '#6a4530'];

export function createPeople(city, rng) {
  const peds = [];
  const manager = {
    peds,
    update(dt, focus, threat, fx, rngFn) {
      // Despawn the far away, spawn near the focus.
      for (let i = peds.length - 1; i >= 0; i -= 1) {
        if (Math.hypot(peds[i].x - focus.x, peds[i].y - focus.y) > PEOPLE.despawnDistance) {
          peds.splice(i, 1);
        }
      }
      let guard = 0;
      while (peds.length < PEOPLE.count && guard < 4) {
        guard += 1;
        const spot = city.randomSidewalkPoint(rngFn);
        if (Math.hypot(spot.x - focus.x, spot.y - focus.y) > PEOPLE.spawnDistance) continue;
        if (Math.hypot(spot.x - focus.x, spot.y - focus.y) < 200) continue;
        peds.push(makePed(spot.x, spot.y, rngFn));
      }
      for (const ped of peds) stepPed(ped, dt, city, threat, fx, rngFn);
    },
    /** The nearest pedestrian to a point, within range — for interactions. */
    nearest(x, y, maxDist) {
      let best = null;
      let bestD = maxDist;
      for (const ped of peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - x, ped.y - y);
        if (d < bestD) { bestD = d; best = ped; }
      }
      return best;
    },
  };
  return manager;
}

function makePed(x, y, rng) {
  return {
    x,
    y,
    angle: range(rng, 0, Math.PI * 2),
    speed: range(rng, 42, 68),
    state: 'walk',
    shirt: pick(rng, SHIRTS),
    skin: pick(rng, SKINS),
    tx: x,
    ty: y,
    timer: range(rng, 0, 3),
    downTimer: 0,
    waiting: false,
    fare: false,
  };
}

function stepPed(ped, dt, city, threat, fx, rngFn) {
  if (ped.state === 'down') {
    ped.downTimer -= dt;
    if (ped.downTimer <= 0) {
      ped.state = 'flee';
      ped.timer = 2;
    }
    return;
  }

  // Flee: something fast and dangerous is close — run away from it.
  if (threat) {
    const d = Math.hypot(threat.x - ped.x, threat.y - ped.y);
    if (d < PEOPLE.fleeRadius && threat.speed > 120) {
      ped.state = 'flee';
      ped.timer = 1.6;
      ped.tx = ped.x + (ped.x - threat.x) * 2;
      ped.ty = ped.y + (ped.y - threat.y) * 2;
    }
  }
  if (ped.state === 'flee') {
    ped.timer -= dt;
    if (ped.timer <= 0) {
      ped.state = 'walk';
      ped.timer = range(rngFn, 1, 4);
    }
  }

  const speed = ped.state === 'flee' ? PEOPLE.fleeSpeed : ped.speed;
  const dx = ped.tx - ped.x;
  const dy = ped.ty - ped.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 12) {
    if (ped.state === 'walk') {
      if (ped.timer > 0) {
        ped.timer -= dt;
        return; // pausing at the corner, looking at a shop window
      }
      const spot = city.randomSidewalkPoint(rngFn);
      ped.tx = spot.x;
      ped.ty = spot.y;
      ped.timer = range(rngFn, 2, 6);
    } else {
      ped.tx = ped.x + range(rngFn, -160, 160);
      ped.ty = ped.y + range(rngFn, -160, 160);
    }
    return;
  }
  const nx = dx / dist;
  const ny = dy / dist;
  ped.angle = Math.atan2(ny, nx);
  ped.x += nx * speed * dt;
  ped.y += ny * speed * dt;
  const res = city.resolveCircle(ped.x, ped.y, 10);
  ped.x = res.x;
  ped.y = res.y;
}

/** Knock a pedestrian down: they lie still, then get up and run. */
export function knockDown(ped, fx) {
  if (ped.state === 'down') return;
  ped.state = 'down';
  ped.downTimer = 3;
  for (let i = 0; i < 8; i += 1) {
    fx.particles.push({
      x: ped.x, y: ped.y - 8, vx: range(Math.random, -70, 70), vy: range(Math.random, -90, -10),
      life: 0.5, maxLife: 0.5, size: 3, color: '#ffd76a', kind: 'spark',
    });
  }
}
