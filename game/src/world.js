// Sunset Coast — the world. One object owns the city, the player, every car and
// pedestrian, the police, the missions, the money, the clock, the camera and the
// effects. It steps all of it in a fixed order every frame, so every system sees
// the same world. The renderer only reads; main.js only feeds it input.

import { WORLD, PLAYER, CAR, WANTED, SIDE, CLOCK, SHOPS } from './config.js';
import { createRandom, pick, range } from './random.js';
import { createCity } from './city.js';
import { createCar, stepCar, separateCars, createTraffic, spawnDust, spawnSmoke } from './vehicles.js';
import { createPeople, knockDown } from './people.js';
import { createPolice } from './police.js';
import { createMissions } from './missions.js';
import { loadSave, writeSave } from './save.js';
import { ACTION_ENTER, ACTION_PUNCH, ACTION_CONFIRM } from './input.js';

export function createWorld(rng, saveData) {
  const city = createCity(rng);
  const save = saveData || { cash: 120, missionIndex: 0, completed: [], ownedCars: [], parcels: 0, earned: 0 };

  const world = {
    rng,
    city,
    timeHours: CLOCK.startHour,
    cash: save.cash,
    earned: save.earned,
    parcelsCollected: save.parcels,
    ownedCars: save.ownedCars.slice(),
    player: { x: 720, y: 600, angle: -Math.PI / 2, health: PLAYER.health, punchTimer: 0 },
    playerCar: null,
    parkedCars: [],
    raceCars: [],
    traffic: createTraffic(city, rng),
    people: createPeople(city, rng),
    police: null,
    missions: null,
    fx: { particles: [], skids: [], shake: 0, sounds: [] },
    camera: { x: 720, y: 600, zoom: 0.85 },
    dialogue: null,
    toast: null,
    shop: null,
    taxi: null,
    overlay: null,
    prompt: null,
    saveTimer: 0,

    showDialogue(lines) {
      world.dialogue = { lines, index: 0, timer: 0 };
    },
    showToast(text) {
      world.toast = { text, timer: 3.2 };
    },
    save() {
      writeSave({
        cash: world.cash,
        missionIndex: world.missions ? world.missions.index : 0,
        completed: world.missions ? world.missions.completed : [],
        ownedCars: world.ownedCars,
        parcels: world.parcelsCollected,
        earned: world.earned,
      });
    },

    step(dt, input) {
      const actions = input.takeActions();
      const digit = input.takeDigit ? input.takeDigit() : 0;

      // Menus freeze the world: the city waits while you shop.
      if (world.shop) {
        if (digit >= 1 && digit <= world.shop.options.length) world.buyOption(digit - 1);
        if (actions & (ACTION_ENTER | ACTION_CONFIRM)) world.shop = null;
        return;
      }
      // Busted / wasted: wait for the player to acknowledge, then carry on.
      if (world.overlay) {
        if (actions & (ACTION_ENTER | ACTION_CONFIRM)) world.overlay = null;
        return;
      }

      world.timeHours += (dt * CLOCK.minutesPerSecond) / 60;
      if (world.timeHours >= 24) world.timeHours -= 24;

      // Dialogue: E / Enter / click advances, or it rolls on by itself.
      if (world.dialogue) {
        world.dialogue.timer += dt;
        if (actions & (ACTION_ENTER | ACTION_CONFIRM) || world.dialogue.timer > 4.5) {
          world.dialogue.index += 1;
          world.dialogue.timer = 0;
          if (world.dialogue.index >= world.dialogue.lines.length) world.dialogue = null;
        }
      }
      if (world.toast) {
        world.toast.timer -= dt;
        if (world.toast.timer <= 0) world.toast = null;
      }

      if (actions & ACTION_ENTER) world.interact();
      if (actions & ACTION_PUNCH) world.punch();

      const fx = world.fx;
      const player = world.player;

      // --- The player, on foot or behind the wheel.
      if (world.playerCar) {
        const car = world.playerCar;
        stepCar(car, {
          throttle: input.throttle(),
          steer: input.steer(),
          handbrake: input.actionHeld(),
        }, dt, city, fx);
        const surface = city.surfaceAt(car.x, car.y);
        if (surface !== 'road' && Math.abs(car.speed) > 200 && Math.random() < dt * 14) {
          spawnDust(fx, car.x, car.y, 1);
        }
        player.x = car.x;
        player.y = car.y;
        player.angle = car.angle;
        if (car.health <= 0 && !car.dead) {
          car.dead = true;
          world.showToast('Your car is wrecked. Get out and walk.');
        }
      } else {
        const walk = input.walkVector();
        const speed = input.running() ? PLAYER.runSpeed : PLAYER.walkSpeed;
        if (walk.x !== 0 || walk.y !== 0) {
          player.angle = Math.atan2(walk.y, walk.x);
          player.x += walk.x * speed * dt;
          player.y += walk.y * speed * dt;
          const res = city.resolveCircle(player.x, player.y, PLAYER.radius);
          player.x = res.x;
          player.y = res.y;
        }
        if (player.punchTimer > 0) player.punchTimer -= dt;
        if (player.health < PLAYER.health && world.police.stars === 0) {
          player.health = Math.min(PLAYER.health, player.health + 2.5 * dt);
        }
      }

      // --- Everyone else.
      const focus = { x: player.x, y: player.y, car: world.playerCar };
      world.traffic.update(dt, focus, fx, rng, true);
      const threat = world.playerCar && Math.abs(world.playerCar.speed) > 120
        ? { x: world.playerCar.x, y: world.playerCar.y, speed: Math.abs(world.playerCar.speed) }
        : null;
      world.people.update(dt, focus, threat, fx, rng);
      world.police.update(dt, world, fx, rng);
      world.missions.update(dt, fx);
      updateRivals(world, dt, fx);
      updateTaxi(world, dt, fx);

      // --- Collisions: cars against cars, cars against people.
      const allCars = [];
      if (world.playerCar) allCars.push(world.playerCar);
      for (const c of world.traffic.cars) allCars.push(c);
      for (const c of world.police.cars) allCars.push(c);
      for (const c of world.parkedCars) allCars.push(c);
      for (const c of world.raceCars) allCars.push(c);
      separateCars(allCars, fx);
      if (world.playerCar) {
        for (const ped of world.people.peds) {
          if (ped.state === 'down') continue;
          const car = world.playerCar;
          const d = Math.hypot(ped.x - car.x, ped.y - car.y);
          if (d < car.width / 2 + 12 && Math.abs(car.speed) > 40) {
            knockDown(ped, fx);
            world.police.addHeat(WANTED.hitPedestrian);
            world.showToast('You hit a pedestrian! The cops saw that.');
            fx.sounds.push('crash');
          }
        }
      }

      // --- Parcels.
      const px = world.playerCar ? world.playerCar.x : player.x;
      const py = world.playerCar ? world.playerCar.y : player.y;
      for (const parcel of city.parcels) {
        if (!parcel.taken && Math.hypot(parcel.x - px, parcel.y - py) < 34) {
          parcel.taken = true;
          world.parcelsCollected += 1;
          world.cash += SIDE.parcelPay;
          world.earned += SIDE.parcelPay;
          world.showToast(`Hidden parcel — $${SIDE.parcelPay} (${world.parcelsCollected}/${SIDE.parcelCount})`);
          fx.sounds.push('pickup');
        }
      }

      // --- Busted / wasted.
      if (world.police.busted) {
        world.police.busted = false;
        doBusted(world);
      } else if (player.health <= 0) {
        doWasted(world);
      }

      // --- Camera: follow with a little look-ahead, shake on top.
      const tx = px + (world.playerCar ? Math.cos(world.playerCar.angle) * world.playerCar.speed * 0.12 : 0);
      const ty = py + (world.playerCar ? Math.sin(world.playerCar.angle) * world.playerCar.speed * 0.12 : 0);
      world.camera.x += (tx - world.camera.x) * Math.min(1, dt * 5);
      world.camera.y += (ty - world.camera.y) * Math.min(1, dt * 5);
      fx.shake = Math.max(0, fx.shake - dt * 26);

      // --- Effects decay.
      for (let i = fx.particles.length - 1; i >= 0; i -= 1) {
        const p = fx.particles[i];
        p.life -= dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        if (p.kind === 'smoke') p.vy -= 12 * dt;
        if (p.life <= 0) fx.particles.splice(i, 1);
      }
      for (let i = fx.skids.length - 1; i >= 0; i -= 1) {
        fx.skids[i].life -= dt;
        if (fx.skids[i].life <= 0) fx.skids.splice(i, 1);
      }
      if (fx.skids.length > 320) fx.skids.splice(0, fx.skids.length - 320);

      // --- Prompt line: what E does right here.
      world.prompt = computePrompt(world);

      // --- Autosave.
      world.saveTimer += dt;
      if (world.saveTimer > 30) {
        world.saveTimer = 0;
        world.save();
      }
    },

    interact() {
      const player = world.player;
      const px = world.playerCar ? world.playerCar.x : player.x;
      const py = world.playerCar ? world.playerCar.y : player.y;
      if (world.dialogue) {
        world.dialogue.index += 1;
        world.dialogue.timer = 0;
        if (world.dialogue.index >= world.dialogue.lines.length) world.dialogue = null;
        return;
      }
      // Shops first: a menu beats getting in or out of a car.
      const shop = nearestShop(world.city, px, py, 120);
      if (shop) {
        world.openShop(shop);
        return;
      }
      // Lena's job at the safehouse.
      if (world.missions.jobAvailable()) {
        const safe = SHOPS.find((s) => s.id === 'safehouse');
        if (Math.hypot(px - safe.x, py - safe.y) < 130) {
          world.missions.start();
          return;
        }
      }
      // Taxi fares need a car and a waiting passenger.
      if (world.playerCar) {
        const ped = world.people.nearest(px, py, 90);
        if (ped && ped.fare && !world.taxi) {
          startTaxi(world, ped);
          return;
        }
      }
      // Otherwise E gets in or out of the nearest car.
      if (world.playerCar) world.exitCar();
      else world.enterCar();
    },

    punch() {
      if (world.playerCar) return;
      const player = world.player;
      player.punchTimer = 0.28;
      const rangePx = PLAYER.punchRange;
      let best = null;
      let bestD = rangePx;
      const facing = (tx, ty) => {
        const ang = Math.atan2(ty - player.y, tx - player.x);
        let diff = ang - player.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        return Math.abs(diff) < 1.1;
      };
      for (const ped of world.people.peds) {
        if (ped.state === 'down') continue;
        const d = Math.hypot(ped.x - player.x, ped.y - player.y);
        if (d < bestD && facing(ped.x, ped.y)) { bestD = d; best = { kind: 'ped', ref: ped }; }
      }
      for (const cop of world.police.cops) {
        const d = Math.hypot(cop.x - player.x, cop.y - player.y);
        if (d < bestD && facing(cop.x, cop.y)) { bestD = d; best = { kind: 'cop', ref: cop }; }
      }
      if (!best) return;
      if (best.kind === 'ped') {
        knockDown(best.ref, world.fx);
        world.police.addHeat(15);
        world.fx.sounds.push('crash');
      } else {
        const cop = best.ref;
        const dx = cop.x - player.x;
        const dy = cop.y - player.y;
        const d = Math.hypot(dx, dy) || 1;
        cop.x += (dx / d) * 90;
        cop.y += (dy / d) * 90;
        world.police.addHeat(10);
        world.police.bustTimer = 0;
        world.fx.sounds.push('crash');
      }
    },

    enterCar() {
      const player = world.player;
      let best = null;
      let bestD = PLAYER.enterRange;
      const consider = (car) => {
        if (!car || car.dead) return;
        if (car.driver === 'ai' && Math.abs(car.speed) > 90) return;
        const d = Math.hypot(car.x - player.x, car.y - player.y);
        if (d < bestD) { bestD = d; best = car; }
      };
      for (const car of world.parkedCars) consider(car);
      for (const car of world.traffic.cars) consider(car);
      for (const car of world.police.cars) consider(car);
      if (!best) return;
      const wasTraffic = world.traffic.cars.includes(best);
      const wasPolice = world.police.cars.includes(best);
      if (wasTraffic) {
        world.traffic.cars.splice(world.traffic.cars.indexOf(best), 1);
        world.police.addHeat(WANTED.stealCar);
        world.showToast('You jacked a car! Someone saw that.');
      }
      if (wasPolice) {
        world.police.cars.splice(world.police.cars.indexOf(best), 1);
        world.police.addHeat(25);
        world.showToast('You stole a cruiser!');
      }
      const parkedAt = world.parkedCars.indexOf(best);
      if (parkedAt >= 0) world.parkedCars.splice(parkedAt, 1);
      best.driver = 'player';
      best.auto = null;
      world.playerCar = best;
      world.fx.sounds.push('click');
    },

    exitCar() {
      const car = world.playerCar;
      if (!car) return;
      const player = world.player;
      const side = car.angle + Math.PI / 2;
      player.x = car.x + Math.cos(side) * (car.width / 2 + 22);
      player.y = car.y + Math.sin(side) * (car.width / 2 + 22);
      const res = world.city.resolveCircle(player.x, player.y, PLAYER.radius);
      player.x = res.x;
      player.y = res.y;
      player.angle = car.angle;
      car.driver = null;
      car.speed = 0;
      world.parkedCars.push(car);
      world.playerCar = null;
    },

    openShop(shop) {
      const options = [];
      const car = world.playerCar;
      if (shop.kind === 'paint') {
        if (!car) {
          options.push({ label: 'Bring a car to Ray\u2019s first', cost: 0, enabled: false });
        } else {
          options.push({ label: `Repair the ${car.name} — $${SIDE.repairCost}`, cost: SIDE.repairCost, enabled: world.cash >= SIDE.repairCost && car.health < car.maxHealth, run: () => { world.cash -= SIDE.repairCost; car.health = car.maxHealth; car.dead = false; world.showToast('Good as new.'); } });
          options.push({ label: `Repaint the ${car.name} — $${SIDE.repaintCost}`, cost: SIDE.repaintCost, enabled: world.cash >= SIDE.repaintCost, run: () => { world.cash -= SIDE.repaintCost; car.color = pick(world.rng, ['#e2543e', '#3e7be2', '#f2c94c', '#7ec850', '#9b59d0', '#39c0c8']); world.showToast('Fresh paint. Nobody will recognise it.'); } });
        }
      } else if (shop.kind === 'dealer') {
        const stock = [
          { model: 'sport', price: 1400 },
          { model: 'suv', price: 900 },
          { model: 'van', price: 600 },
          { model: 'hatch', price: 250 },
        ];
        for (const item of stock) {
          const owned = world.ownedCars.includes(item.model);
          options.push({
            label: owned ? `${carName(item.model)} — owned, parked at the safehouse` : `Buy the ${carName(item.model)} — $${item.price}`,
            cost: owned ? 0 : item.price,
            enabled: !owned && world.cash >= item.price,
            run: () => {
              world.cash -= item.price;
              world.ownedCars.push(item.model);
              deliverToSafehouse(world, item.model);
              world.showToast(`The ${carName(item.model)} is waiting at the safehouse.`);
            },
          });
        }
      } else if (shop.kind === 'fixer') {
        const stars = world.police.stars;
        options.push({
          label: stars > 0 ? `Bribe the cops — $${SIDE.bribePerStar} (clears 1 star)` : 'No heat on you right now',
          cost: SIDE.bribePerStar,
          enabled: stars > 0 && world.cash >= SIDE.bribePerStar,
          run: () => {
            world.cash -= SIDE.bribePerStar;
            world.police.heat = Math.max(0, world.police.heat - 20);
            world.police.stars = Math.floor(world.police.heat / 20);
            world.showToast('One star bought off. For now.');
          },
        });
      } else if (shop.kind === 'hospital') {
        options.push({
          label: 'Get patched up — $40',
          cost: 40,
          enabled: world.cash >= 40 && world.player.health < PLAYER.health,
          run: () => { world.cash -= 40; world.player.health = PLAYER.health; world.showToast('Patched up.'); },
        });
      } else if (shop.kind === 'safehouse') {
        if (world.missions.jobAvailable()) {
          options.push({ label: `Start Lena\u2019s job: ${nextJobTitle(world)}`, cost: 0, enabled: true, run: () => { world.shop = null; world.missions.start(); } });
        }
        for (const model of world.ownedCars) {
          options.push({
            label: `Take the ${carName(model)}`,
            cost: 0,
            enabled: true,
            run: () => {
              world.shop = null;
              takeOwnedCar(world, model);
            },
          });
        }
        options.push({ label: 'Save the game', cost: 0, enabled: true, run: () => { world.save(); world.showToast('Game saved.'); } });
      }
      if (options.length === 0) options.push({ label: 'Nothing here right now', cost: 0, enabled: false });
      world.shop = { shop, options };
      world.fx.sounds.push('click');
    },

    buyOption(i) {
      const option = world.shop.options[i];
      if (!option || !option.enabled || !option.run) return;
      option.run();
      world.fx.sounds.push('cash');
      if (world.shop) world.shop = null;
    },
  };

  world.police = createPolice(city, rng);
  world.missions = createMissions(world);
  if (save.missionIndex > 0) {
    world.missions.index = save.missionIndex;
    world.missions.completed = save.completed.slice();
  }
  return world;
}

function carName(model) {
  const names = { sedan: 'Comet', hatch: 'Wasp', suv: 'Bison', sport: 'Comet GT', van: 'Harbor Van', truck: 'Hauler', taxi: 'Coast Cab', police: 'Falcon Interceptor', racer: 'Vortex R' };
  return names[model] || model;
}

function nextJobTitle(world) {
  const defs = ['First Wheels', 'Impound Heist', 'The Getaway', 'Harbor Run', 'King of the Coast'];
  return defs[world.missions.index] || 'No jobs left';
}

function nearestShop(city, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  for (const shop of city.shops) {
    const d = Math.hypot(shop.x - x, shop.y - y);
    if (d < bestD) { bestD = d; best = shop; }
  }
  return best;
}

function deliverToSafehouse(world, model) {
  const car = createCar(model, 720 + range(world.rng, -60, 60), 620 + range(world.rng, -20, 20), Math.PI / 2, pick(world.rng, ['#e2543e', '#3e7be2', '#f2c94c', '#7ec850']), 'parked');
  car.driver = null;
  world.parkedCars.push(car);
}

function takeOwnedCar(world, model) {
  let car = world.parkedCars.find((c) => c.model === model && Math.hypot(c.x - 720, c.y - 540) < 320);
  if (!car) {
    car = createCar(model, 760, 600, Math.PI / 2, '#e2543e', 'parked');
    car.driver = null;
    world.parkedCars.push(car);
  }
  const at = world.parkedCars.indexOf(car);
  if (at >= 0) world.parkedCars.splice(at, 1);
  car.driver = 'player';
  world.playerCar = car;
  world.player.x = car.x;
  world.player.y = car.y;
}

function computePrompt(world) {
  const player = world.player;
  const px = world.playerCar ? world.playerCar.x : player.x;
  const py = world.playerCar ? world.playerCar.y : player.y;
  if (world.dialogue) return 'E — Continue';
  const shop = nearestShop(world.city, px, py, 120);
  if (shop) return `E — ${shop.name}`;
  if (world.missions.jobAvailable()) {
    const safe = SHOPS.find((s) => s.id === 'safehouse');
    if (Math.hypot(px - safe.x, py - safe.y) < 130) return 'E — Talk to Lena (new job)';
  }
  if (world.playerCar) {
    const ped = world.people.nearest(px, py, 90);
    if (ped && ped.fare && !world.taxi) return 'E — Taxi fare';
    return 'E — Get out';
  }
  const near = nearestCar(world, px, py, 78);
  if (near) return near.kind === 'police' ? 'E — Steal the cruiser' : 'E — Get in the car';
  return null;
}

function nearestCar(world, x, y, maxDist) {
  let best = null;
  let bestD = maxDist;
  const consider = (car) => {
    if (!car || car.dead) return;
    const d = Math.hypot(car.x - x, car.y - y);
    if (d < bestD) { bestD = d; best = car; }
  };
  for (const car of world.parkedCars) consider(car);
  for (const car of world.traffic.cars) consider(car);
  for (const car of world.police.cars) consider(car);
  return best;
}

function updateRivals(world, dt, fx) {
  const run = world.missions.active;
  if (!run || run.def.id !== 'harbor-run') return;
  const cps = run.data.checkpoints;
  for (const rival of world.raceCars) {
    if (rival.auto.cp >= cps.length || rival.dead) continue;
    const target = cps[rival.auto.cp];
    const wantAngle = Math.atan2(target.y - rival.y, target.x - rival.x);
    let diff = wantAngle - rival.angle;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const steer = Math.max(-1, Math.min(1, diff * 2.4));
    stepCar(rival, { throttle: 1, steer, handbrake: false }, dt, world.city, fx);
  }
}

function updateTaxi(world, dt, fx) {
  let fares = 0;
  for (const ped of world.people.peds) if (ped.fare) fares += 1;
  if (fares < 2 && Math.random() < dt * 0.2) {
    const ped = world.people.peds[Math.floor(Math.random() * world.people.peds.length)];
    if (ped && !ped.fare && ped.state !== 'down') ped.fare = true;
  }
  const taxi = world.taxi;
  if (!taxi) return;
  taxi.timer -= dt;
  const px = world.playerCar ? world.playerCar.x : world.player.x;
  const py = world.playerCar ? world.playerCar.y : world.player.y;
  if (Math.hypot(px - taxi.dest.x, py - taxi.dest.y) < 90) {
    world.cash += taxi.pay;
    world.earned += taxi.pay;
    world.showToast(`Fare complete — $${taxi.pay}`);
    fx.sounds.push('cash');
    world.taxi = null;
    return;
  }
  if (taxi.timer <= 0 || !world.playerCar) {
    world.showToast('The passenger walked off. Fare cancelled.');
    world.taxi = null;
  }
}

function startTaxi(world, ped) {
  ped.fare = false;
  const dest = world.city.randomRoadPoint(world.rng);
  const px = world.playerCar.x;
  const py = world.playerCar.y;
  const dist = Math.hypot(dest.x - px, dest.y - py);
  const pay = Math.max(SIDE.taxiPayMin, Math.min(SIDE.taxiPayMax, Math.round(dist / 40)));
  world.taxi = { ped, dest, timer: dist * SIDE.taxiTimePerUnit + 25, pay };
  world.showToast(`Fare: take them to the marker — $${pay}`);
  world.fx.sounds.push('click');
  const at = world.people.peds.indexOf(ped);
  if (at >= 0) world.people.peds.splice(at, 1);
}

function doBusted(world) {
  const fine = Math.min(world.cash, WANTED.bustFine);
  world.cash -= fine;
  if (world.playerCar) {
    const lot = world.city.impound;
    world.playerCar.x = (lot.gateX0 + lot.gateX1) / 2;
    world.playerCar.y = lot.y1 - 60;
    world.playerCar.angle = Math.PI / 2;
    world.playerCar.speed = 0;
    world.playerCar.lat = 0;
    world.playerCar.driver = null;
    world.parkedCars.push(world.playerCar);
    world.playerCar = null;
  }
  world.player.x = 3160;
  world.player.y = 1870;
  world.player.health = PLAYER.health;
  world.police.clear();
  if (world.missions.active) world.missions.fail('busted');
  world.overlay = 'busted';
  world.fx.sounds.push('busted');
  world.showToast(`Busted! Fine $${fine}. Your car is in the impound lot.`);
  world.save();
}

function doWasted(world) {
  const fine = Math.min(world.cash, WANTED.wasteFine);
  world.cash -= fine;
  if (world.playerCar) {
    world.playerCar.driver = null;
    world.playerCar.speed = 0;
    world.parkedCars.push(world.playerCar);
    world.playerCar = null;
  }
  world.player.x = 1080;
  world.player.y = 1700;
  world.player.health = PLAYER.health;
  world.police.clear();
  if (world.missions.active) world.missions.fail('wasted');
  world.overlay = 'wasted';
  world.fx.sounds.push('busted');
  world.showToast(`Wasted! Hospital bill $${fine}.`);
  world.save();
}
