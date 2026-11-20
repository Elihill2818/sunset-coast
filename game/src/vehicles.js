// Cars: arcade driving physics for the player, autopilot traffic that follows the
// road grid, and pairwise separation so cars never vibrate inside each other.
// A car moves with a forward speed along its heading plus a lateral slide that the
// grip bleeds off — that slide is what makes handbrake turns feel like drifting.

import { CAR, CAR_MODELS, TRAFFIC } from './config.js';
import { AVENUES, STREETS, AVENUE_HALF, STREET_HALF } from './city.js';
import { range, pick } from './random.js';

let nextId = 1;

export function createCar(model, x, y, angle, color, kind) {
  const spec = CAR_MODELS[model];
  return {
    id: nextId,
    kind: kind || 'traffic',
    model,
    name: spec.name,
    x,
    y,
    angle,
    speed: 0,
    lat: 0,
    health: spec.hp,
    maxHealth: spec.hp,
    color: color || '#e2543e',
    length: spec.length,
    width: spec.width,
    top: spec.top,
    accel: spec.accel,
    dead: false,
    smoke: 0,
    // Autopilot state, used by traffic and police cars.
    auto: null,
    // Who drives: 'player', 'ai', or null (parked).
    driver: null,
  };
}

/** One physics step for a driven car. `drive` is {throttle, steer, handbrake}. */
export function stepCar(car, drive, dt, city, fx) {
  const surface = city.surfaceAt(car.x, car.y);
  const offRoad = surface !== 'road';
  const sand = surface === 'sand';
  const drag = offRoad ? (sand ? CAR.sandDrag : CAR.offRoadDrag) : 0.32;
  const grip = drive.handbrake ? 2.1 : CAR.grip;

  const top = car.top * (offRoad ? 0.62 : 1);
  if (drive.throttle > 0) {
    car.speed += CAR.accel * car.accel * drive.throttle * dt;
  } else if (drive.throttle < 0) {
    if (car.speed > 8) car.speed -= CAR.brake * dt;
    else car.speed -= CAR.reverseAccel * car.accel * dt;
  }
  if (drive.handbrake) car.speed -= Math.sign(car.speed) * CAR.handbrakeDecel * dt * 0.7;
  car.speed -= car.speed * drag * dt * 0.55;
  if (car.speed > top) car.speed = top;
  if (car.speed < -CAR.maxReverse) car.speed = -CAR.maxReverse;
  if (Math.abs(car.speed) < 3 && drive.throttle === 0) car.speed = 0;

  // Steering: no turn at a standstill, less turn at very high speed, reversed in reverse.
  const speedFactor = Math.min(Math.abs(car.speed) / 230, 1) * (1 - (Math.abs(car.speed) / Math.max(top, 1)) * 0.42);
  const turn = CAR.turnRate * (drive.handbrake ? CAR.handbrakeTurn : 1) * speedFactor * (car.speed < 0 ? -1 : 1);
  car.angle += drive.steer * turn * dt;

  // Lateral slide: the handbrake lets the tail step out, the grip pulls it back.
  car.lat *= Math.exp(-grip * dt);
  if (drive.handbrake && Math.abs(car.speed) > 120) {
    car.lat += drive.steer * car.speed * 0.55 * dt;
  }

  const fxv = Math.cos(car.angle);
  const fyv = Math.sin(car.angle);
  const px = -fyv;
  const py = fxv;
  car.x += (fxv * car.speed + px * car.lat) * dt;
  car.y += (fyv * car.speed + py * car.lat) * dt;

  // Walls: kill the velocity running into the wall, keep the slide along it.
  const radius = car.width / 2 + 7;
  const before = Math.abs(car.speed);
  const res = city.resolveCircle(car.x, car.y, radius);
  car.x = res.x;
  car.y = res.y;
  if (res.hit) {
    const vx = fxv * car.speed + px * car.lat;
    const vy = fyv * car.speed + py * car.lat;
    const into = vx * res.nx + vy * res.ny;
    if (into < 0) {
      const impact = -into;
      car.speed -= (fxv * res.nx + fyv * res.ny) * into * 0.9;
      car.lat -= (px * res.nx + py * res.ny) * into * 0.9;
      if (impact > 130) {
        const dmg = Math.min(18, (impact - 130) / 22);
        car.health -= dmg;
        fx.shake = Math.min(14, fx.shake + impact / 90);
        fx.sounds.push(impact > 260 ? 'crash-hard' : 'crash');
        spawnSparks(fx, car.x + res.nx * radius, car.y + res.ny * radius, 6);
      }
      if (car.health <= 0 && !car.dead) {
        car.dead = true;
        car.health = 0;
        fx.sounds.push('crash-hard');
        spawnSmoke(fx, car.x, car.y, 26);
      }
    }
  }
  if (before > 60 && drive.handbrake) {
    fx.skids.push({ x: car.x - fxv * car.length * 0.32, y: car.y - fyv * car.length * 0.32, angle: car.angle, life: 5 });
  }
  if (car.health < CAR.smokeBelow && !car.dead && Math.random() < dt * 8) {
    fx.particles.push({
      x: car.x + range(Math.random, -8, 8), y: car.y - 10, vx: range(Math.random, -12, 12),
      vy: -26, life: 0.9, maxLife: 0.9, size: range(Math.random, 5, 9), color: '#5a5a5a', kind: 'smoke',
    });
  }
  if (car.health <= 0) car.health = 0;
}

export function spawnSparks(fx, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 140;
    fx.particles.push({
      x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s,
      life: 0.35, maxLife: 0.35, size: 2 + Math.random() * 2, color: '#ffd76a', kind: 'spark',
    });
  }
}

export function spawnSmoke(fx, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    fx.particles.push({
      x: x + range(Math.random, -20, 20), y: y + range(Math.random, -14, 14),
      vx: range(Math.random, -16, 16), vy: range(Math.random, -34, -8),
      life: 1.4, maxLife: 1.4, size: range(Math.random, 7, 14), color: '#4a4a4a', kind: 'smoke',
    });
  }
}

export function spawnDust(fx, x, y, n) {
  for (let i = 0; i < n; i += 1) {
    fx.particles.push({
      x: x + range(Math.random, -10, 10), y: y + range(Math.random, -10, 10),
      vx: range(Math.random, -20, 20), vy: range(Math.random, -24, 4),
      life: 0.6, maxLife: 0.6, size: range(Math.random, 3, 6), color: '#cbb98a', kind: 'dust',
    });
  }
}

/** Push overlapping cars apart by their penetration depth — never elastic math,
 *  so cars slide off each other instead of vibrating. Returns the impact speed. */
export function separateCars(cars, fx) {
  let worst = 0;
  for (let i = 0; i < cars.length; i += 1) {
    const a = cars[i];
    if (a.dead) continue;
    for (let j = i + 1; j < cars.length; j += 1) {
      const b = cars[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      const min = (a.length + b.length) / 2 - 14;
      if (dist >= min || dist < 0.001) continue;
      const overlap = (min - dist) / 2;
      const nx = dx / dist;
      const ny = dy / dist;
      a.x -= nx * overlap;
      a.y -= ny * overlap;
      b.x += nx * overlap;
      b.y += ny * overlap;
      const rel = Math.abs(
        (Math.cos(a.angle) * a.speed - Math.cos(b.angle) * b.speed) * nx +
        (Math.sin(a.angle) * a.speed - Math.sin(b.angle) * b.speed) * ny,
      );
      if (rel > 90) {
        worst = Math.max(worst, rel);
        const dmg = Math.min(14, (rel - 90) / 26);
        a.health -= dmg;
        b.health -= dmg;
        a.speed *= 0.82;
        b.speed *= 0.82;
        fx.shake = Math.min(12, fx.shake + rel / 120);
        spawnSparks(fx, (a.x + b.x) / 2, (a.y + b.y) / 2, 5);
        if (a.health <= 0) { a.dead = true; a.health = 0; }
        if (b.health <= 0) { b.dead = true; b.health = 0; }
      }
    }
  }
  return worst;
}

/** Traffic: cars that follow the road grid. Each one drives its road to the next
 *  intersection, then picks a new road. A car that waits too long, or drifts too
 *  far from the player, despawns and a fresh one spawns near the player. */
export function createTraffic(city, rng) {
  const cars = [];
  const manager = {
    cars,
    update(dt, focus, fx, rngFn, allowSpawn) {
      // Despawn far cars and wrecked cars.
      for (let i = cars.length - 1; i >= 0; i -= 1) {
        const c = cars[i];
        if (c.dead || Math.hypot(c.x - focus.x, c.y - focus.y) > TRAFFIC.despawnDistance) {
          cars.splice(i, 1);
        }
      }
      if (allowSpawn) {
        let guard = 0;
        while (cars.length < TRAFFIC.count && guard < 6) {
          guard += 1;
          const spot = city.randomRoadPoint(rngFn);
          if (Math.hypot(spot.x - focus.x, spot.y - focus.y) < 420) continue;
          if (Math.hypot(spot.x - focus.x, spot.y - focus.y) > TRAFFIC.spawnDistance) continue;
          const model = pick(rngFn, ['sedan', 'sedan', 'hatch', 'suv', 'van', 'taxi', 'sedan']);
          const car = createCar(model, spot.x, spot.y, spot.angle + (rngFn() < 0.5 ? 0 : Math.PI), pick(rngFn, ['#e2543e', '#3e7be2', '#f2c94c', '#7ec850', '#e2e2e2', '#2b2f38', '#9b59d0']), 'traffic');
          car.driver = 'ai';
          car.auto = {
            vertical: spot.vertical,
            dir: rngFn() < 0.5 ? 1 : -1,
            wait: 0,
            stuck: 0,
            targetSpeed: range(rngFn, 120, TRAFFIC.speedLimit),
          };
          cars.push(car);
        }
      }
      for (const car of cars) stepTraffic(car, dt, city, cars, focus, fx);
    },
  };
  return manager;
}

function angleTo(x, y, tx, ty) {
  return Math.atan2(ty - y, tx - x);
}

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function stepTraffic(car, dt, city, allCars, focus, fx) {
  const auto = car.auto;
  // The car ahead: brake if anything is in front of us on our road.
  let ahead = Infinity;
  for (const other of allCars) {
    if (other === car || other.dead) continue;
    const dx = other.x - car.x;
    const dy = other.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < TRAFFIC.slowDistance && side < 42) ahead = Math.min(ahead, along);
  }
  // The player counts as a car ahead too.
  if (focus.car && !focus.car.dead) {
    const dx = focus.car.x - car.x;
    const dy = focus.car.y - car.y;
    const along = dx * Math.cos(car.angle) + dy * Math.sin(car.angle);
    const side = Math.abs(-dx * Math.sin(car.angle) + dy * Math.cos(car.angle));
    if (along > 0 && along < TRAFFIC.slowDistance && side < 42) ahead = Math.min(ahead, along);
  }

  let throttle = 1;
  let targetSpeed = auto.targetSpeed;
  if (ahead < TRAFFIC.stopDistance) {
    throttle = -1;
    targetSpeed = 0;
  } else if (ahead < TRAFFIC.slowDistance) {
    targetSpeed = Math.min(targetSpeed, 60);
  }

  // Intersections: on a vertical road the next cross street decides a turn.
  const lines = auto.vertical ? STREETS : AVENUES;
  const half = auto.vertical ? STREET_HALF : AVENUE_HALF;
  const pos = auto.vertical ? car.y : car.x;
  let nextLine = null;
  for (const line of lines) {
    const d = (line - pos) * auto.dir;
    if (d > 0 && d < 170) { nextLine = line; break; }
  }
  if (nextLine !== null) {
    const dist = Math.abs(nextLine - pos);
    if (dist < 46 && auto.wait <= 0) {
      // Choose: straight, left or right — never a U-turn.
      const roll = Math.random();
      if (roll < 0.55) {
        // Straight on.
      } else {
        auto.vertical = !auto.vertical;
        auto.dir = roll < 0.78 ? 1 : -1;
        auto.wait = TRAFFIC.turnPause;
      }
    }
    if (dist < 120) targetSpeed = Math.min(targetSpeed, 90);
  }

  if (auto.wait > 0) {
    auto.wait -= dt;
    throttle = 0;
    targetSpeed = 0;
  }

  // Steer toward a point ahead on our lane: right-hand traffic, 20 units off the
  // centreline. Homing onto the lane (instead of just matching the road angle)
  // keeps cars from drifting onto the sidewalk after a turn.
  const roadAngle = auto.vertical ? (auto.dir > 0 ? Math.PI / 2 : -Math.PI / 2) : (auto.dir > 0 ? 0 : Math.PI);
  const line = auto.vertical ? nearestLine(AVENUES, car.x) : nearestLine(STREETS, car.y);
  const aheadX = auto.vertical ? line : car.x + auto.dir * 90;
  const aheadY = auto.vertical ? car.y + auto.dir * 90 : line;
  const rightX = -Math.sin(roadAngle);
  const rightY = Math.cos(roadAngle);
  const wantAngle = Math.atan2(aheadY + rightY * 20 - car.y, aheadX + rightX * 20 - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  const steer = Math.max(-1, Math.min(1, diff * 2.2));

  // Ease toward the target speed instead of slamming the throttle.
  const want = Math.min(targetSpeed, car.top);
  const throttleOut = car.speed < want ? throttle : (car.speed > want + 20 ? -0.4 : 0);
  stepCar(car, { throttle: throttleOut, steer, handbrake: false }, dt, city, fx);

  // If we are barely moving while trying, we are stuck: wait, then give up the spot.
  if (Math.abs(car.speed) < 12 && throttleOut > 0) auto.stuck += dt;
  else auto.stuck = 0;
  if (auto.stuck > 2.5) {
    auto.stuck = 0;
    auto.wait = 0.4;
    car.angle += Math.PI / 2;
  }
}

function nearestLine(lines, v) {
  let best = lines[0];
  let bestD = Infinity;
  for (const line of lines) {
    const d = Math.abs(line - v);
    if (d < bestD) { bestD = d; best = line; }
  }
  return best;
}
