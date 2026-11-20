// The wanted system and the police. Heat is the real number (0–100); stars are just
// heat divided by 20. Heat only cools when no police car has been near the player
// for a while — hiding works, driving past a cruiser does not. Police cars spawn at
// the edge of town and hunt; foot cops step out when the player is on foot. Get
// caught standing still next to the law for too long and you are busted.

import { WANTED, POLICE } from './config.js';
import { createCar, stepCar } from './vehicles.js';
import { pick, range } from './random.js';

function angleDiff(a, b) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

export function createPolice(city, rng) {
  const state = {
    heat: 0,
    stars: 0,
    hiddenTimer: 0,
    bustTimer: 0,
    busted: false,
    cars: [],
    cops: [],
    addHeat(amount) {
      state.heat = Math.min(100, state.heat + amount);
      state.hiddenTimer = WANTED.hiddenSeconds;
      state.stars = Math.min(WANTED.maxStars, Math.floor(state.heat / WANTED.perStar));
    },
    clear() {
      state.heat = 0;
      state.stars = 0;
      state.hiddenTimer = 0;
      state.bustTimer = 0;
      state.busted = false;
      state.cars = [];
      state.cops = [];
    },
    update(dt, world, fx, rngFn) {
      const player = world.player;
      const playerCar = world.playerCar;
      const px = playerCar ? playerCar.x : player.x;
      const py = playerCar ? playerCar.y : player.y;

      // Hiding: the clock only runs when no cruiser is close.
      let nearestPolice = Infinity;
      for (const car of state.cars) {
        nearestPolice = Math.min(nearestPolice, Math.hypot(car.x - px, car.y - py));
      }
      if (nearestPolice < 420) state.hiddenTimer = WANTED.hiddenSeconds;
      else state.hiddenTimer -= dt;
      if (state.hiddenTimer <= 0 && state.heat > 0) {
        state.heat = Math.max(0, state.heat - WANTED.decayPerSecond * dt);
        state.stars = Math.min(WANTED.maxStars, Math.floor(state.heat / WANTED.perStar));
      }

      // Cruisers: one per star, up to four.
      const want = Math.min(POLICE.maxCars, state.stars);
      let guard = 0;
      while (state.cars.length < want && guard < 3) {
        guard += 1;
        const spot = city.randomRoadPoint(rngFn);
        const d = Math.hypot(spot.x - px, spot.y - py);
        if (d < POLICE.spawnDistance * 0.8 || d > 1600) continue;
        const car = createCar('police', spot.x, spot.y, Math.atan2(py - spot.y, px - spot.x), '#20242e', 'police');
        car.driver = 'ai';
        car.auto = { stuck: 0, reverse: 0 };
        state.cars.push(car);
      }
      for (let i = state.cars.length - 1; i >= 0; i -= 1) {
        const car = state.cars[i];
        if (car.dead) {
          state.cars.splice(i, 1);
          continue;
        }
        if (state.stars === 0 && Math.hypot(car.x - px, car.y - py) > 900) {
          state.cars.splice(i, 1);
          continue;
        }
        stepPoliceCar(car, dt, city, px, py, playerCar, fx);
      }

      // Foot cops: only when the player is on foot and the heat is on.
      if (!playerCar && state.stars >= 2) {
        while (state.cops.length < 2) {
          const spot = city.randomSidewalkPoint(rngFn);
          if (Math.hypot(spot.x - player.x, spot.y - player.y) < 380) continue;
          state.cops.push({ x: spot.x, y: spot.y, angle: 0, stuck: 0 });
        }
      } else if (state.cops.length > 0 && (playerCar || state.stars === 0)) {
        state.cops = [];
      }
      for (const cop of state.cops) {
        const dx = player.x - cop.x;
        const dy = player.y - cop.y;
        const d = Math.hypot(dx, dy);
        if (d > 1) {
          cop.angle = Math.atan2(dy, dx);
          cop.x += (dx / d) * POLICE.footSpeed * dt;
          cop.y += (dy / d) * POLICE.footSpeed * dt;
        }
        const res = city.resolveCircle(cop.x, cop.y, 12);
        cop.x = res.x;
        cop.y = res.y;
      }

      // Busted: a cop touches the player on foot, or cruisers box a stopped car in.
      let touching = false;
      if (!playerCar) {
        for (const cop of state.cops) {
          if (Math.hypot(cop.x - player.x, cop.y - player.y) < 30) touching = true;
        }
      } else if (playerCar.speed !== undefined && Math.abs(playerCar.speed) < 25) {
        let near = 0;
        for (const car of state.cars) {
          if (Math.hypot(car.x - px, car.y - py) < 110) near += 1;
        }
        if (near >= 1 && state.stars >= 1) touching = true;
      }
      if (touching) {
        state.bustTimer += dt;
        if (state.bustTimer >= WANTED.bustTouchSeconds) {
          state.busted = true;
          state.bustTimer = 0;
        }
      } else {
        state.bustTimer = Math.max(0, state.bustTimer - dt * 2);
      }
    },
  };
  return state;
}

function stepPoliceCar(car, dt, city, px, py, playerCar, fx) {
  const auto = car.auto;
  // Aim slightly ahead of the player: cruisers cut the corner, they do not tail-chase.
  const lead = playerCar ? 0.35 : 0.1;
  const pvx = playerCar ? Math.cos(playerCar.angle) * playerCar.speed : 0;
  const pvy = playerCar ? Math.sin(playerCar.angle) * playerCar.speed : 0;
  const tx = px + pvx * lead;
  const ty = py + pvy * lead;
  const wantAngle = Math.atan2(ty - car.y, tx - car.x);
  const diff = angleDiff(car.angle, wantAngle);
  const dist = Math.hypot(tx - car.x, ty - car.y);

  let throttle = 1;
  let steer = Math.max(-1, Math.min(1, diff * 2.4));
  let handbrake = false;
  if (dist < 60) {
    throttle = 0.25; // nose to nose: ease off, do not orbit the player
  }
  if (Math.abs(diff) > 2.1 && Math.abs(car.speed) > 60) {
    handbrake = true; // spin the car around instead of a three-point turn
  }
  if (auto.reverse > 0) {
    auto.reverse -= dt;
    throttle = -1;
    steer = -steer;
  } else if (Math.abs(car.speed) < 14 && dist > 80) {
    auto.stuck += dt;
    if (auto.stuck > 1.6) {
      auto.stuck = 0;
      auto.reverse = 0.8;
    }
  } else {
    auto.stuck = 0;
  }
  stepCar(car, { throttle, steer, handbrake }, dt, city, fx);
}
