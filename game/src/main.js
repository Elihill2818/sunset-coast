// Boot and the one loop: input is read once per frame, the world advances in
// fixed 1/60 s steps, and the renderer paints what is there. Screens: title,
// play, paused, busted, wasted.
//
// ?seed=N fixes the city. ?shot=start|drive|chase|mission (with &seed=N) stages
// that scene instead of running the loop, paints it twice and sets
// window.__shotReady for a screenshot.
import { STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld } from './world.js';
import { ACTION_CONFIRM, ACTION_ENTER, ACTION_MUTE, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WASTED } from './render.js';
import { createAudio } from './audio.js';
import { loadSave } from './save.js';
import { stageShot } from './shots.js';

const MAX_FRAME = 0.25;
const HINT_SECONDS = 6;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const renderer = createRenderer(canvas);
const audio = createAudio();

const IDLE_PILOT = {
  throttle: () => 0,
  steer: () => 0,
  running: () => false,
  walkVector: () => ({ x: 0, y: 0 }),
  actionHeld: () => 0,
  takeActions: () => 0,
  takeDigit: () => 0,
};

function announce(message) {
  status.textContent = message;
}

if (shot) {
  const world = createWorld(createRandom(seed), null);
  const scene = stageShot(shot, world);
  let painted = 0;
  function paint() {
    renderer.draw(world, scene.screen, { dt: 1 / 60, hintTimer: 0, hasSave: false, saveSummary: '' });
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
} else {
  runGame();
}

function runGame() {
  const saveData = loadSave();
  const world = createWorld(createRandom(seed), saveData);
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let accumulator = 0;
  let last = performance.now();
  let hintTimer = HINT_SECONDS;
  let titleDrift = 0;

  const saveSummary = saveData
    ? `Saved: $${saveData.cash.toLocaleString()}  •  ${saveData.completed.length} job${saveData.completed.length === 1 ? '' : 's'} done  •  $${saveData.earned.toLocaleString()} earned`
    : '';

  function startGame() {
    audio.unlock();
    screen = SCREEN_PLAY;
    accumulator = 0;
    announce('Playing. Steal a car, take a job from Lena, and own the coast.');
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const dt = Math.min((now - last) / 1000, MAX_FRAME);
    last = now;

    // One read per frame: the world gets the same presses through a wrapper
    // that only answers on the first sub-step, so a single E never fires twice.
    const actions = input.takeActions();
    const digit = input.takeDigit();
    if (actions & ACTION_MUTE) audio.setMuted(!audio.isMuted());

    // Screen-level keys are handled here; the world gets the rest.
    if (screen === SCREEN_TITLE) {
      if (actions & (ACTION_CONFIRM | ACTION_ENTER)) startGame();
    } else if (screen === SCREEN_PLAY) {
      if (actions & ACTION_PAUSE) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      }
    } else if (screen === SCREEN_PAUSED) {
      if (actions & (ACTION_PAUSE | ACTION_CONFIRM)) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }

    let actionsLeft = actions;
    let digitLeft = digit;
    const stepInput = {
      throttle: () => input.throttle(),
      steer: () => input.steer(),
      running: () => input.running(),
      walkVector: () => input.walkVector(),
      actionHeld: () => input.actionHeld(),
      takeActions: () => {
        const taken = actionsLeft;
        actionsLeft = 0;
        return taken;
      },
      takeDigit: () => {
        const taken = digitLeft;
        digitLeft = 0;
        return taken;
      },
    };

    if (screen === SCREEN_TITLE) {
      // Attract mode: the city lives behind the title, camera drifting.
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, IDLE_PILOT);
        accumulator -= STEP;
      }
      titleDrift += dt;
      world.camera.x = 720 + Math.sin(titleDrift * 0.08) * 200;
      world.camera.y = 600 + Math.cos(titleDrift * 0.06) * 140;
    } else if (screen === SCREEN_PLAY) {
      accumulator += dt;
      while (accumulator >= STEP) {
        world.step(STEP, stepInput);
        accumulator -= STEP;
      }
      hintTimer = Math.max(0, hintTimer - dt);
      if (world.overlay === 'busted') screen = SCREEN_BUSTED;
      else if (world.overlay === 'wasted') screen = SCREEN_WASTED;
    } else if (screen === SCREEN_BUSTED || screen === SCREEN_WASTED) {
      // The world is frozen until the player acknowledges.
      world.step(STEP, stepInput);
      if (!world.overlay) screen = SCREEN_PLAY;
      accumulator = 0;
    } else {
      accumulator = 0;
    }

    // Sound effects the world queued this frame, then the engine hum.
    for (const name of world.fx.sounds) audio.play(name);
    world.fx.sounds.length = 0;
    const car = world.playerCar;
    audio.engine(car ? Math.abs(car.speed) : 0, world.police.stars);

    renderer.draw(world, screen, { dt, hintTimer, hasSave: !!saveData, saveSummary });
  }

  // Leaving the tab pauses a running game rather than letting it run unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  announce(saveData ? 'Sunset Coast. Press Enter to continue.' : 'Sunset Coast. Press Enter to start.');
  requestAnimationFrame(frame);
}
