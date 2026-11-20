// The story: five jobs from Lena Solis, the fixer. Each mission is a small state
// machine — stages with a target marker, a condition, and a reward. The world owns
// the player, the police and the money; missions only read that state and set the
// current objective. Getting busted or wasted fails the active mission; the job
// waits at the safehouse to be tried again.

import { MISSIONS, SIDE } from './config.js';
import { createCar } from './vehicles.js';

export function createMissions(world) {
  const state = {
    index: 0,
    active: null,
    completed: [],
    /** The current objective for the HUD, minimap and edge arrow. */
    objective: null,
    start() {
      if (state.active || state.index >= MISSIONS.length) return false;
      const def = MISSIONS[state.index];
      const run = { def, stage: 0, timer: 0, data: {} };
      state.active = run;
      world.showDialogue(def.brief);
      setupMission(world, run);
      return true;
    },
    update(dt, fx) {
      if (!state.active) return;
      const run = state.active;
      run.timer += dt;
      updateMission(world, run, dt, fx);
    },
    complete(fx) {
      const run = state.active;
      if (!run) return;
      world.cash += run.def.reward;
      state.completed.push(run.def.id);
      state.index += 1;
      state.active = null;
      state.objective = null;
      world.showDialogue([run.def.done]);
      world.showToast(`Job complete — $${run.def.reward}`);
      fx.sounds.push('mission-done');
      world.save();
    },
    fail(reason) {
      const run = state.active;
      if (!run) return;
      state.active = null;
      state.objective = null;
      world.showToast(`Job failed — ${reason}. Talk to Lena at the safehouse to retry.`);
      world.showDialogue([['Lena', 'That went sideways. Come back to the safehouse when you are ready to try again.']]);
    },
    /** The next job marker: the safehouse, while a job is waiting. */
    jobAvailable() {
      return !state.active && state.index < MISSIONS.length;
    },
  };
  return state;
}

function setObjective(state, x, y, label) {
  state.objective = { x, y, label };
}

function setupMission(world, run) {
  const id = run.def.id;
  if (id === 'first-wheels') {
    // A Comet waits two blocks east of the player's start, highlighted.
    const spot = world.city.nearestRoadPoint(world.player.x + 420, world.player.y + 60);
    const car = createCar('sedan', spot.x, spot.y, 0, '#e2543e', 'parked');
    car.driver = null;
    world.parkedCars.push(car);
    run.data.car = car;
    setObjective(world.missions, car.x, car.y, 'Get in the Comet');
  } else if (id === 'impound-heist') {
    const lot = world.city.impound;
    const car = createCar('police', (lot.gateX0 + lot.gateX1) / 2 + 40, lot.y1 - 60, Math.PI / 2, '#20242e', 'parked');
    car.driver = null;
    car.falcon = true;
    world.parkedCars.push(car);
    run.data.car = car;
    setObjective(world.missions, (lot.gateX0 + lot.gateX1) / 2, lot.y0, 'Enter the impound lot');
  } else if (id === 'the-getaway') {
    world.police.addHeat(60);
    setObjective(world.missions, 1920, 2700, 'Lose the heat — or reach the pier hideout');
  } else if (id === 'harbor-run') {
    run.data.checkpoints = [
      { x: 800, y: 2520 },
      { x: 1700, y: 2160 },
      { x: 2500, y: 2520 },
      { x: 3300, y: 2520 },
    ];
    run.data.cp = 0;
    run.data.rivals = spawnRivals(world, run);
    run.data.startTime = run.timer;
    setObjective(world.missions, 800, 2520, 'Checkpoint 1 of 4');
  } else if (id === 'king-of-the-coast') {
    run.data.drops = [
      { x: 700, y: 600, got: false },
      { x: 2900, y: 900, got: false },
      { x: 1500, y: 1900, got: false },
    ];
    run.data.drop = 0;
    run.data.armed = false;
    setObjective(world.missions, 700, 600, 'Pick up drop 1 of 3');
  }
}

function spawnRivals(world, run) {
  const rivals = [];
  const starts = [
    { x: 420, y: 2520, angle: 0 },
    { x: 380, y: 2520, angle: 0 },
    { x: 340, y: 2520, angle: 0 },
  ];
  const colors = ['#9b59d0', '#39c0c8', '#e28a3e'];
  for (let i = 0; i < 3; i += 1) {
    const car = createCar('racer', starts[i].x, starts[i].y, starts[i].angle, colors[i], 'racer');
    car.driver = 'ai';
    car.auto = { cp: 0, stuck: 0, reverse: 0 };
    rivals.push(car);
    world.raceCars.push(car);
  }
  return rivals;
}

function updateMission(world, run, dt, fx) {
  const id = run.def.id;
  const player = world.player;
  const car = world.playerCar;
  const px = car ? car.x : player.x;
  const py = car ? car.y : player.y;

  if (id === 'first-wheels') {
    if (run.stage === 0) {
      if (car && car === run.data.car) {
        run.stage = 1;
        world.showToast('Nice wheels. Now get to Ray\u2019s Paint Shop.');
        setObjective(world.missions, 1560, 1260, 'Drive to Ray\u2019s Paint Shop');
      }
    } else if (run.stage === 1) {
      if (Math.hypot(px - 1560, py - 1260) < 110) {
        world.ownedCars.push('sedan');
        world.missions.complete(fx);
      }
    }
    return;
  }

  if (id === 'impound-heist') {
    const lot = world.city.impound;
    if (run.stage === 0) {
      if (px > lot.x0 && px < lot.x1 && py > lot.y0 && py < lot.y1) {
        run.stage = 1;
        world.police.addHeat(12);
        world.showToast('Inside the lot. Take the Falcon.');
        setObjective(world.missions, run.data.car.x, run.data.car.y, 'Steal the Falcon');
      }
    } else if (run.stage === 1) {
      if (car && car === run.data.car) {
        run.stage = 2;
        world.police.addHeat(30);
        world.showToast('The Falcon is yours. Lose them and get to the safehouse.');
        setObjective(world.missions, 720, 540, 'Escape to the safehouse');
      }
    } else if (run.stage === 2) {
      if (Math.hypot(px - 720, py - 540) < 120 && world.police.stars < 2) {
        world.ownedCars.push('police');
        world.missions.complete(fx);
      }
    }
    return;
  }

  if (id === 'the-getaway') {
    if (world.police.heat <= 0) {
      world.missions.complete(fx);
      return;
    }
    if (Math.hypot(px - 1920, py - 2700) < 110) {
      world.police.clear();
      world.missions.complete(fx);
    }
    return;
  }

  if (id === 'harbor-run') {
    const cps = run.data.checkpoints;
    const cp = cps[run.data.cp];
    if (cp && Math.hypot(px - cp.x, cp.y - py) < 90) {
      run.data.cp += 1;
      fx.sounds.push('checkpoint');
      if (run.data.cp >= cps.length) {
        const rivalsDone = run.data.rivals.filter((r) => r.auto.cp >= cps.length).length;
        const reward = rivalsDone === 0 ? run.def.reward : 150;
        world.cash += reward;
        world.missions.completed.push(run.def.id);
        world.missions.index += 1;
        world.missions.active = null;
        world.missions.objective = null;
        world.showDialogue([rivalsDone === 0 ? ['Lena', 'You own the coast road now. They will not forget that.'] : ['Lena', 'You finished, but they were faster. The pot goes to someone else — take the cut.']]);
        world.showToast(rivalsDone === 0 ? `You won the Harbor Run — $${reward}` : `Harbor Run done — $${reward}`);
        fx.sounds.push('mission-done');
        world.save();
        world.raceCars.length = 0;
        return;
      }
      setObjective(world.missions, cps[run.data.cp].x, cps[run.data.cp].y, `Checkpoint ${run.data.cp + 1} of 4`);
    }
    // Rivals race the same checkpoints.
    for (const rival of run.data.rivals) {
      if (rival.auto.cp >= cps.length) continue;
      const target = cps[rival.auto.cp];
      if (Math.hypot(rival.x - target.x, rival.y - target.y) < 90) rival.auto.cp += 1;
    }
    return;
  }

  if (id === 'king-of-the-coast') {
    const drops = run.data.drops;
    if (run.stage === 0) {
      const drop = drops[run.data.drop];
      if (drop && Math.hypot(px - drop.x, py - drop.y) < 80) {
        drop.got = true;
        if (!run.data.armed) {
          run.data.armed = true;
          world.police.addHeat(80);
          world.showToast('Four stars. Every cop on the coast is coming.');
        }
        run.data.drop += 1;
        fx.sounds.push('pickup');
        if (run.data.drop >= drops.length) {
          run.stage = 1;
          setObjective(world.missions, 1920, 2840, 'Reach the end of the pier');
        } else {
          const next = drops[run.data.drop];
          setObjective(world.missions, next.x, next.y, `Pick up drop ${run.data.drop + 1} of 3`);
        }
      }
    } else if (run.stage === 1) {
      if (Math.hypot(px - 1920, py - 2840) < 90) {
        world.missions.complete(fx);
      }
    }
  }
}
