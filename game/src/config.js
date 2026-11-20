// Sunset Coast — every tuning number, colour and name in one place.
// The playfield is a fixed 1280x720 logical view; the renderer scales it to the window,
// so no rule below depends on the screen size. All art is procedural: no image or audio
// files exist anywhere in game/.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The city, in world units. Roads run on a grid; the beach and sea sit along the south edge. */
export const WORLD = { width: 3840, height: 2880 };

/** Where progress is kept between visits (this browser only). */
export const SAVE_KEY = 'sunset-coast.save.v1';

export const PLAYER = {
  walkSpeed: 250,
  runSpeed: 360,
  radius: 14,
  health: 100,
  punchRange: 52,
  punchDamage: 34,
  enterRange: 78,
  bustTime: 2.5,
};

export const CAR = {
  accel: 540,
  brake: 980,
  reverseAccel: 320,
  maxReverse: 190,
  turnRate: 2.7,
  grip: 5.5,
  handbrakeDecel: 760,
  handbrakeTurn: 1.45,
  offRoadDrag: 2.6,
  sandDrag: 4.2,
  damagePerHit: 9,
  smokeBelow: 45,
  disabledBelow: 0,
};

/** Per-model car tuning: top speed, acceleration factor, toughness, size. */
export const CAR_MODELS = {
  sedan: { name: 'Comet', top: 520, accel: 1.0, hp: 100, length: 64, width: 30, price: 0 },
  hatch: { name: 'Wasp', top: 500, accel: 1.12, hp: 80, length: 54, width: 28, price: 250 },
  suv: { name: 'Bison', top: 470, accel: 0.9, hp: 150, length: 70, width: 34, price: 900 },
  sport: { name: 'Comet GT', top: 660, accel: 1.25, hp: 90, length: 66, width: 30, price: 1400 },
  van: { name: 'Harbor Van', top: 430, accel: 0.8, hp: 130, length: 74, width: 34, price: 600 },
  truck: { name: 'Hauler', top: 400, accel: 0.7, hp: 180, length: 92, width: 36, price: 0 },
  taxi: { name: 'Coast Cab', top: 520, accel: 1.0, hp: 100, length: 64, width: 30, price: 0 },
  police: { name: 'Falcon Interceptor', top: 690, accel: 1.3, hp: 160, length: 68, width: 32, price: 0 },
  racer: { name: 'Vortex R', top: 640, accel: 1.22, hp: 90, length: 64, width: 30, price: 0 },
};

export const CAR_COLORS = [
  '#e2543e', '#3e7be2', '#f2c94c', '#7ec850', '#e2e2e2', '#2b2f38',
  '#e28a3e', '#9b59d0', '#39c0c8', '#c83e6b', '#5a8f6a', '#d8d3c3',
];

export const TRAFFIC = {
  count: 14,
  speedLimit: 165,
  slowDistance: 150,
  stopDistance: 56,
  spawnDistance: 900,
  despawnDistance: 1300,
  turnPause: 0.9,
};

export const PEOPLE = {
  count: 22,
  walkSpeed: 55,
  fleeSpeed: 210,
  fleeRadius: 170,
  spawnDistance: 700,
  despawnDistance: 1100,
};

/** Wanted heat: 20 heat is one star. Heat is what the police actually chase. */
export const WANTED = {
  perStar: 20,
  maxStars: 5,
  decayPerSecond: 1.6,
  hiddenSeconds: 6,
  hitPedestrian: 25,
  stealCar: 15,
  hitTraffic: 8,
  speedingPastPolice: 10,
  trespass: 12,
  bustTouchSeconds: 2.5,
  bustFine: 200,
  wasteFine: 150,
};

export const POLICE = {
  maxCars: 4,
  chaseSpeed: 640,
  ramDamage: 12,
  footSpeed: 265,
  spawnDistance: 800,
  sightRange: 620,
};

/** Game clock: one real second is one game minute. The day starts at golden hour. */
export const CLOCK = {
  startHour: 17.5,
  minutesPerSecond: 1,
  sunsetHour: 18.4,
  duskHour: 19.1,
  nightHour: 19.8,
  dawnHour: 6.5,
};

/** The five story missions, in order. Lena Solis is the fixer who calls the player. */
export const MISSIONS = [
  {
    id: 'first-wheels',
    title: 'First Wheels',
    reward: 150,
    brief: [
      ['Lena', 'Jax, welcome to Sunset Coast. First rule: never walk when you can drive.'],
      ['Lena', 'There is a Comet parked two blocks east. Take it — nobody will miss it.'],
      ['Lena', 'Bring it to Ray\u2019s Paint Shop in Old Town. That is your safehouse car from now on.'],
    ],
    done: ['Lena', 'Nice. The Comet is yours now. Next job pays real money.'],
  },
  {
    id: 'impound-heist',
    title: 'Impound Heist',
    reward: 400,
    brief: [
      ['Lena', 'The Docks impound lot is holding a Falcon Interceptor. Military engine, police plates.'],
      ['Lena', 'Get inside, take the Falcon, and get out. The lot is fenced — use the gate on the north side.'],
      ['Lena', 'Expect heat the moment you touch it. Lose them, then bring the Falcon to the safehouse.'],
    ],
    done: ['Lena', 'A police Falcon in our garage. You are officially a problem for this city.'],
  },
  {
    id: 'the-getaway',
    title: 'The Getaway',
    reward: 350,
    brief: [
      ['Lena', 'A job went loud in Neon Row and the whole coast is looking for you. Three stars, Jax.'],
      ['Lena', 'Stay out of sight until the heat dies, or reach the hideout under the pier.'],
      ['Lena', 'Do not get busted. The fine alone would hurt.'],
    ],
    done: ['Lena', 'Clean. Not a single cop knows your face tonight.'],
  },
  {
    id: 'harbor-run',
    title: 'Harbor Run',
    reward: 500,
    brief: [
      ['Lena', 'Three rivals run the coast road every night. Tonight you race them.'],
      ['Lena', 'Hit every checkpoint in order. First across the line takes the pot.'],
      ['Lena', 'They drive dirty. So do you.'],
    ],
    done: ['Lena', 'You own the coast road now. They will not forget that.'],
  },
  {
    id: 'king-of-the-coast',
    title: 'King of the Coast',
    reward: 900,
    brief: [
      ['Lena', 'Last job, biggest score. Three drops across the city, then the pier.'],
      ['Lena', 'The moment you grab the first drop, every cop on the coast wakes up. Four stars.'],
      ['Lena', 'Finish this and you are not a driver anymore. You are the King of the Coast.'],
    ],
    done: ['Lena', 'King of the Coast. The whole city saw you do it.'],
  },
];

/** Side work: taxi fares pay 40–80, hidden parcels pay 25 each. */
export const SIDE = {
  taxiPayMin: 40,
  taxiPayMax: 80,
  taxiTimePerUnit: 0.055,
  parcelCount: 30,
  parcelPay: 25,
  repairCost: 50,
  repaintCost: 30,
  bribePerStar: 150,
};

export const SHOPS = [
  { id: 'paint', name: 'Ray\u2019s Paint Shop', kind: 'paint', x: 1560, y: 1260 },
  { id: 'dealer', name: 'Coast Motors', kind: 'dealer', x: 2520, y: 540 },
  { id: 'fixer', name: 'The Fixer', kind: 'fixer', x: 3120, y: 2340 },
  { id: 'safehouse', name: 'Safehouse', kind: 'safehouse', x: 720, y: 540 },
  { id: 'hospital', name: 'St. Marina Hospital', kind: 'hospital', x: 1080, y: 1620 },
  { id: 'impound', name: 'Docks Impound Lot', kind: 'impound', x: 3120, y: 1980 },
];

export const DISTRICTS = [
  { name: 'Palm Heights', x0: 0, y0: 0, x1: 1920, y1: 1080 },
  { name: 'Neon Row', x0: 1920, y0: 0, x1: 3840, y1: 1080 },
  { name: 'Old Town', x0: 0, y0: 1080, x1: 1920, y1: 2160 },
  { name: 'The Docks', x0: 1920, y0: 1080, x1: 3840, y1: 2160 },
  { name: 'Marina Bay', x0: 0, y0: 2160, x1: 3840, y1: 2880 },
];

export const PALETTE = {
  asphalt: '#3a3f4a',
  asphaltDark: '#33373f',
  lane: '#d8d3a8',
  sidewalk: '#9aa0a8',
  curb: '#7d838d',
  grass: '#5f9e52',
  grassDark: '#548c48',
  sand: '#e0c98f',
  water: '#2e7fa8',
  waterDeep: '#256b8f',
  building: '#8a7f72',
  roofA: '#b0563f',
  roofB: '#4f6f8f',
  roofC: '#7a8a5a',
  roofD: '#9a8a6a',
  park: '#4f8f46',
  sky: '#ffd9a0',
  text: '#f2f0e8',
  muted: '#c9c4b4',
  panel: 'rgba(16, 18, 26, 0.82)',
  panelEdge: '#f2c94c',
  star: '#f2c94c',
  health: '#58c96b',
  healthLow: '#e2543e',
  money: '#7ee787',
  police: '#3e7be2',
  marker: '#f2c94c',
  danger: '#e2543e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
