// Screenshot scenes: each one stages a real moment of the game — a fresh world,
// a scripted driver, and the same fixed steps the game itself runs. Nothing here
// is posed by hand: the traffic, the police and the physics all run for real,
// which is why the frames look alive instead of arranged.

import { STEP } from './config.js';
import { createCar } from './vehicles.js';

function makePilot(throttle, steer) {
  return {
    throttle: () => throttle,
    steer: () => steer,
    running: () => false,
    walkVector: () => ({ x: 0, y: 0 }),
    actionHeld: () => 0,
    takeActions: () => 0,
    takeDigit: () => 0,
  };
}

const IDLE = makePilot(0, 0);

function runSteps(world, pilot, count) {
  for (let i = 0; i < count; i += 1) world.step(STEP, pilot);
}

export function stageShot(name, world) {
  if (name === 'start') {
    // Golden hour over Palm Heights: Lena's first job, the red Comet, and the
    // player pulling away from the kerb. The title sits on top of this.
    world.timeHours = 17.5;
    world.missions.start();
    const car = world.missions.active.data.car;
    world.player.x = car.x;
    world.player.y = car.y + 30;
    world.enterCar();
    runSteps(world, makePilot(0.55, 0), 200);
    // Drop the camera so the car sits below the title text, not behind it.
    world.camera.y -= 170;
    return { screen: 'title' };
  }

  if (name === 'drive') {
    // Full throttle down the coast road at golden hour: beach and sea to the
    // south, the pier sliding past, traffic to thread.
    world.timeHours = 17.8;
    const car = createCar('sport', 560, 2520, 0, '#e2543e', 'parked');
    world.parkedCars.push(car);
    world.player.x = 560;
    world.player.y = 2550;
    world.enterCar();
    runSteps(world, makePilot(1, 0), 200);
    return { screen: 'play' };
  }

  if (name === 'chase') {
    // Dusk, three stars, the Getaway job: a teal Comet GT running east while
    // the cruisers close in behind it.
    world.timeHours = 18.8;
    world.missions.index = 2;
    world.missions.start();
    const car = createCar('sport', 1440, 1440, 0, '#39c0c8', 'parked');
    world.parkedCars.push(car);
    world.player.x = 1440;
    world.player.y = 1470;
    world.enterCar();
    // A short run: the cruisers spawn 800 behind and close for 2.5 s, so they
    // end up right on the player's bumper instead of a screen behind.
    runSteps(world, makePilot(1, 0), 150);
    world.dialogue = null;
    // One more beat so the prompt refreshes (it is computed inside step).
    runSteps(world, makePilot(1, 0), 2);
    return { screen: 'play' };
  }

  if (name === 'mission') {
    // Night at the impound lot: the Falcon is stolen, three stars are up, and
    // the player is flooring it out of the gate with the law behind.
    world.timeHours = 20.5;
    world.missions.index = 1;
    world.missions.start();
    const falcon = world.missions.active.data.car;
    world.player.x = falcon.x - 40;
    world.player.y = falcon.y + 40;
    runSteps(world, IDLE, 3);
    world.enterCar();
    runSteps(world, IDLE, 2);
    // 12 (entering the lot) + 30 (stealing) + 18 = 60 heat, three stars.
    world.police.addHeat(18);
    const car = world.playerCar;
    car.x = 3160;
    car.angle = -Math.PI / 2;
    // Just out of the gate — any further north and the Falcon meets a building.
    runSteps(world, makePilot(1, 0), 70);
    world.dialogue = null;
    // One more beat so the prompt refreshes (it is computed inside step).
    runSteps(world, makePilot(1, 0), 2);
    return { screen: 'play' };
  }

  return { screen: 'play' };
}
