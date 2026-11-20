// Sunset Coast — the renderer. One canvas, two spaces: the world (camera, zoom,
// shake) and the screen (HUD, minimap, menus, all in the fixed 1280x720 logical
// view). Everything is drawn with flat shapes and a few glows — no images, no
// fonts to load. Day and night come from the game clock: golden hour, sunset,
// dusk and night each shift the palette and switch the street lamps on.

import { VIEW, FONT, PALETTE } from './config.js';
import { AVENUES, STREETS, AVENUE_HALF, STREET_HALF, SIDEWALK, SAND_Y, WATER_Y, PIER } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_BUSTED = 'busted';
export const SCREEN_WASTED = 'wasted';

const LIGHT_STOPS = [
  [0, 0.85, 0],
  [5.5, 0.85, 0],
  [6.5, 0.12, 0.25],
  [8, 0, 0],
  [16.5, 0.04, 0.1],
  [17.5, 0.1, 0.45],
  [18.4, 0.32, 0.95],
  [19.2, 0.68, 0.5],
  [20, 0.85, 0.1],
  [24, 0.85, 0],
];

function lightAt(hour) {
  let a = LIGHT_STOPS[0];
  let b = LIGHT_STOPS[LIGHT_STOPS.length - 1];
  for (let i = 0; i < LIGHT_STOPS.length - 1; i += 1) {
    if (hour >= LIGHT_STOPS[i][0] && hour <= LIGHT_STOPS[i + 1][0]) {
      a = LIGHT_STOPS[i];
      b = LIGHT_STOPS[i + 1];
      break;
    }
  }
  const t = b[0] === a[0] ? 0 : (hour - a[0]) / (b[0] - a[0]);
  return {
    dark: a[1] + (b[1] - a[1]) * t,
    warm: a[2] + (b[2] - a[2]) * t,
    lamps: hour < 6.5 || hour >= 18.8,
  };
}

function rr(ctx, x, y, w, h, r) {
  const rad = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

function starPath(ctx, x, y, r) {
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const ang = -Math.PI / 2 + (i * Math.PI) / 5;
    const rad = i % 2 === 0 ? r : r * 0.45;
    const px = x + Math.cos(ang) * rad;
    const py = y + Math.sin(ang) * rad;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
}

function formatClock(hour) {
  const h = Math.floor(hour) % 24;
  const m = Math.floor((hour % 1) * 60);
  const ap = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${ap}`;
}

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let animT = 0;

  function draw(world, screen, opts) {
    animT += opts.dt || 0;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cw = canvas.clientWidth || VIEW.width;
    const ch = canvas.clientHeight || VIEW.height;
    if (canvas.width !== Math.floor(cw * dpr) || canvas.height !== Math.floor(ch * dpr)) {
      canvas.width = Math.floor(cw * dpr);
      canvas.height = Math.floor(ch * dpr);
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const scale = Math.min(cw / VIEW.width, ch / VIEW.height);
    const ox = (cw - VIEW.width * scale) / 2;
    const oy = (ch - VIEW.height * scale) / 2;
    ctx.fillStyle = '#0c0e14';
    ctx.fillRect(0, 0, cw, ch);

    const cam = world.camera;
    const shakeX = world.fx.shake > 0 ? (Math.random() - 0.5) * world.fx.shake : 0;
    const shakeY = world.fx.shake > 0 ? (Math.random() - 0.5) * world.fx.shake : 0;
    const light = lightAt(world.timeHours);

    // ---- World space.
    ctx.save();
    ctx.translate(ox + cw / 2, oy + ch / 2);
    ctx.scale(scale * cam.zoom, scale * cam.zoom);
    ctx.translate(-cam.x + shakeX, -cam.y + shakeY);
    drawGround(world, light);
    drawRoads(world);
    drawParks(world);
    drawBeach(world);
    drawBuildings(world, light);
    drawProps(world, light);
    drawSkids(world);
    drawParcels(world);
    drawMissionMarkers(world);
    drawCars(world, light);
    drawPeople(world);
    drawParticles(world);
    drawPlayer(world);
    drawLights(world, light);
    ctx.restore();

    // ---- Nightfall and sunset wash over the world (not the HUD).
    if (light.dark > 0.02) {
      ctx.fillStyle = `rgba(8, 12, 40, ${(light.dark * 0.36).toFixed(3)})`;
      ctx.fillRect(ox, oy, VIEW.width * scale, VIEW.height * scale);
    }
    if (light.warm > 0.05) {
      ctx.fillStyle = `rgba(255, 110, 30, ${(light.warm * 0.13).toFixed(3)})`;
      ctx.fillRect(ox, oy, VIEW.width * scale, VIEW.height * scale);
    }

    // ---- Screen space: HUD and screens.
    ctx.save();
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHUD(world, light, opts);
    if (screen === SCREEN_TITLE) drawTitle(world, opts);
    if (screen === SCREEN_PAUSED) drawPaused(world);
    if (screen === SCREEN_BUSTED) drawBusted(world);
    if (screen === SCREEN_WASTED) drawWasted(world);
    ctx.restore();
  }

  function drawGround(world, light) {
    const city = world.city;
    ctx.fillStyle = PALETTE.grass;
    ctx.fillRect(-80, -80, city.width + 160, city.height + 160);
    // Mow stripes on the grass for texture.
    ctx.fillStyle = PALETTE.grassDark;
    for (let y = 0; y < city.height; y += 120) {
      ctx.fillRect(0, y, city.width, 46);
    }
    void light;
  }

  function drawRoads(world) {
    const city = world.city;
    // Sidewalk aprons first, then asphalt, so the kerb reads.
    for (const road of city.roads) {
      if (road.vertical) {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(road.at - road.half - SIDEWALK, 0, (road.half + SIDEWALK) * 2, city.height);
        ctx.fillStyle = PALETTE.asphalt;
        ctx.fillRect(road.at - road.half, 0, road.half * 2, city.height);
      } else {
        ctx.fillStyle = PALETTE.sidewalk;
        ctx.fillRect(0, road.at - road.half - SIDEWALK, city.width, (road.half + SIDEWALK) * 2);
        ctx.fillStyle = PALETTE.asphalt;
        ctx.fillRect(0, road.at - road.half, city.width, road.half * 2);
      }
    }
    // Lane dashes and crosswalks.
    ctx.fillStyle = PALETTE.lane;
    for (const x of AVENUES) {
      for (let y = 40; y < city.height; y += 96) ctx.fillRect(x - 3, y, 6, 44);
    }
    for (const y of STREETS) {
      for (let x = 40; x < city.width; x += 96) ctx.fillRect(x, y - 3, 44, 6);
    }
    ctx.fillStyle = 'rgba(240, 240, 230, 0.85)';
    for (const x of AVENUES) {
      for (const y of STREETS) {
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(x - AVENUE_HALF + 8, y + i * 14 - 5, 14, 8);
          ctx.fillRect(x + AVENUE_HALF - 22, y + i * 14 - 5, 14, 8);
        }
        for (let i = -3; i <= 3; i += 1) {
          ctx.fillRect(x + i * 14 - 5, y - STREET_HALF + 8, 8, 14);
          ctx.fillRect(x + i * 14 - 5, y + STREET_HALF - 22, 8, 14);
        }
      }
    }
    // Impound lot asphalt.
    const lot = city.impound;
    ctx.fillStyle = '#4a4d55';
    ctx.fillRect(lot.x0, lot.y0, lot.x1 - lot.x0, lot.y1 - lot.y0);
    ctx.strokeStyle = '#d8d3a8';
    ctx.lineWidth = 3;
    ctx.strokeRect(lot.x0 + 8, lot.y0 + 8, lot.x1 - lot.x0 - 16, lot.y1 - lot.y0 - 16);
    // Fence.
    ctx.fillStyle = '#6a6f78';
    for (const f of city.fences) ctx.fillRect(f.x, f.y, f.w, f.h);
    ctx.fillStyle = PALETTE.marker;
    ctx.font = `bold 17px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('IMPOUND', (lot.x0 + lot.x1) / 2, lot.y0 + 26);
  }

  function drawParks(world) {
    for (const p of world.city.parks) {
      ctx.fillStyle = PALETTE.park;
      ctx.fillRect(p.x0, p.y0, p.x1 - p.x0, p.y1 - p.y0);
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.fillRect(p.x0 + (p.x1 - p.x0) / 2 - 6, p.y0, 12, p.y1 - p.y0);
      ctx.fillRect(p.x0, p.y0 + (p.y1 - p.y0) / 2 - 6, p.x1 - p.x0, 12);
    }
  }

  function drawBeach(world) {
    const city = world.city;
    ctx.fillStyle = PALETTE.sand;
    ctx.fillRect(0, SAND_Y, city.width, WATER_Y - SAND_Y);
    // The sea, with slow waves.
    ctx.fillStyle = PALETTE.water;
    ctx.fillRect(0, WATER_Y, city.width, city.height - WATER_Y);
    ctx.fillStyle = PALETTE.waterDeep;
    for (let x = 0; x < city.width; x += 240) {
      const wob = Math.sin(animT * 0.7 + x * 0.01) * 6;
      ctx.fillRect(x, WATER_Y + 26 + wob, 150, 5);
      ctx.fillRect(x + 90, WATER_Y + 74 - wob, 120, 5);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(0, WATER_Y - 4, city.width, 4);
    // The pier.
    ctx.fillStyle = '#7a5a38';
    ctx.fillRect(PIER.x0, PIER.y0, PIER.x1 - PIER.x0, PIER.y1 - PIER.y0);
    ctx.fillStyle = '#8f6c44';
    for (let y = PIER.y0 + 8; y < PIER.y1; y += 22) ctx.fillRect(PIER.x0, y, PIER.x1 - PIER.x0, 3);
    ctx.fillStyle = PALETTE.marker;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PIER', (PIER.x0 + PIER.x1) / 2, PIER.y1 - 12);
  }

  function drawBuildings(world, light) {
    for (const b of world.city.buildings) {
      // A drop shadow thrown east, longer at golden hour.
      const sh = b.hgt * (0.7 + light.warm * 0.9);
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(b.x + 6 + sh * 0.4, b.y + 8 + sh * 0.25, b.w, b.h);
      ctx.fillStyle = b.color;
      ctx.fillRect(b.x, b.y, b.w, b.h);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 2;
      ctx.strokeRect(b.x + 1, b.y + 1, b.w - 2, b.h - 2);
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      ctx.fillRect(b.x + 6, b.y + 6, b.w - 12, 10);
      if (b.roof) {
        ctx.fillStyle = 'rgba(0,0,0,0.25)';
        ctx.fillRect(b.x + b.w * 0.3, b.y + b.h * 0.3, 18, 14);
        ctx.fillStyle = '#3f6f8f';
        ctx.fillRect(b.x + b.w * 0.62, b.y + b.h * 0.55, 22, 14);
      }
      // A few windows lit at night — decided by the building's position so
      // they stay put instead of flickering frame to frame.
      if (light.lamps && ((b.x * 7 + b.y * 13) % 5) < 2) {
        ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
        ctx.fillRect(b.x + 10, b.y + b.h - 14, 8, 6);
        ctx.fillRect(b.x + b.w - 18, b.y + 12, 8, 6);
      }
    }
    // Shop signs.
    ctx.textAlign = 'center';
    for (const shop of world.city.shops) {
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, shop.x - 62, shop.y - 34, 124, 22, 6);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `bold 13px ${FONT}`;
      ctx.fillText(shop.name.toUpperCase(), shop.x, shop.y - 18);
    }
  }

  function drawProps(world, light) {
    for (const tree of world.city.trees) {
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      ctx.beginPath();
      ctx.arc(tree.x + 4, tree.y + 5, tree.r, 0, Math.PI * 2);
      ctx.fill();
      if (tree.palm) {
        ctx.strokeStyle = '#7a5a38';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(tree.x, tree.y);
        ctx.lineTo(tree.x + 3, tree.y - 6);
        ctx.stroke();
        ctx.fillStyle = '#3f8f3a';
      } else {
        ctx.fillStyle = '#2f7a2e';
      }
      ctx.beginPath();
      ctx.arc(tree.x, tree.y, tree.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      ctx.beginPath();
      ctx.arc(tree.x - 3, tree.y - 4, tree.r * 0.45, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const lamp of world.city.lamps) {
      ctx.fillStyle = '#565b66';
      ctx.fillRect(lamp.x - 2, lamp.y - 2, 4, 4);
      if (light.lamps) {
        ctx.fillStyle = 'rgba(255, 214, 120, 0.9)';
        ctx.beginPath();
        ctx.arc(lamp.x, lamp.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSkids(world) {
    for (const skid of world.fx.skids) {
      ctx.save();
      ctx.translate(skid.x, skid.y);
      ctx.rotate(skid.angle);
      ctx.fillStyle = `rgba(20, 20, 22, ${Math.min(0.55, skid.life * 0.14)})`;
      ctx.fillRect(-16, -3, 32, 6);
      ctx.restore();
    }
  }

  function drawParcels(world) {
    for (const parcel of world.city.parcels) {
      if (parcel.taken) continue;
      const pulse = 0.6 + 0.4 * Math.sin(animT * 3 + parcel.x);
      ctx.fillStyle = `rgba(242, 201, 76, ${0.25 * pulse})`;
      ctx.beginPath();
      ctx.arc(parcel.x, parcel.y, 22, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#f2c94c';
      ctx.fillRect(parcel.x - 8, parcel.y - 8, 16, 16);
      ctx.strokeStyle = '#8a6a1a';
      ctx.lineWidth = 2;
      ctx.strokeRect(parcel.x - 8, parcel.y - 8, 16, 16);
      ctx.beginPath();
      ctx.moveTo(parcel.x, parcel.y - 8);
      ctx.lineTo(parcel.x, parcel.y + 8);
      ctx.moveTo(parcel.x - 8, parcel.y);
      ctx.lineTo(parcel.x + 8, parcel.y);
      ctx.stroke();
    }
  }

  function drawMissionMarkers(world) {
    const obj = world.missions.objective;
    const taxi = world.taxi;
    const targets = [];
    if (obj) targets.push({ x: obj.x, y: obj.y, color: PALETTE.marker, label: obj.label });
    if (taxi) targets.push({ x: taxi.dest.x, y: taxi.dest.y, color: '#7ee787', label: 'Drop-off' });
    if (world.missions.jobAvailable()) {
      const safe = world.city.shops.find((s) => s.id === 'safehouse');
      targets.push({ x: safe.x, y: safe.y, color: '#7ec8f2', label: 'New job' });
    }
    for (const t of targets) {
      const bob = Math.sin(animT * 4) * 5;
      ctx.save();
      ctx.translate(t.x, t.y + bob - 26);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = t.color;
      ctx.fillRect(-11, -11, 22, 22);
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.strokeRect(-11, -11, 22, 22);
      ctx.restore();
      ctx.strokeStyle = t.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(t.x, t.y - 16 + bob);
      ctx.lineTo(t.x, t.y + 4);
      ctx.stroke();
    }
  }

  function drawCarShape(car, light) {
    ctx.save();
    ctx.translate(car.x, car.y);
    ctx.rotate(car.angle);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    rr(ctx, -car.length / 2 + 4, -car.width / 2 + 5, car.length, car.width, 7);
    ctx.fill();
    // Wheels.
    ctx.fillStyle = '#16181d';
    const wl = car.length * 0.28;
    ctx.fillRect(-wl, -car.width / 2 - 3, 14, 7);
    ctx.fillRect(wl - 8, -car.width / 2 - 3, 14, 7);
    ctx.fillRect(-wl, car.width / 2 - 4, 14, 7);
    ctx.fillRect(wl - 8, car.width / 2 - 4, 14, 7);
    // Body.
    ctx.fillStyle = car.color;
    rr(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 8);
    ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.4)';
    ctx.lineWidth = 2;
    rr(ctx, -car.length / 2, -car.width / 2, car.length, car.width, 8);
    ctx.stroke();
    // Cabin and glass.
    ctx.fillStyle = 'rgba(20, 28, 40, 0.85)';
    rr(ctx, -car.length * 0.18, -car.width / 2 + 5, car.length * 0.36, car.width - 10, 5);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.20)';
    ctx.fillRect(-car.length * 0.14, -car.width / 2 + 7, car.length * 0.1, car.width - 14);
    // Headlights and tail lights.
    ctx.fillStyle = light.lamps ? '#ffe9a8' : '#fff8d8';
    ctx.fillRect(car.length / 2 - 4, -car.width / 2 + 4, 4, 6);
    ctx.fillRect(car.length / 2 - 4, car.width / 2 - 10, 4, 6);
    ctx.fillStyle = '#e2543e';
    ctx.fillRect(-car.length / 2, -car.width / 2 + 4, 4, 6);
    ctx.fillRect(-car.length / 2, car.width / 2 - 10, 4, 6);
    if (car.kind === 'police') {
      ctx.fillStyle = '#f2f0e8';
      ctx.fillRect(-car.length * 0.32, -car.width / 2 + 2, car.length * 0.2, car.width - 4);
      const blink = Math.floor(animT * 6) % 2 === 0;
      ctx.fillStyle = blink ? '#e2543e' : '#3e7be2';
      ctx.fillRect(-6, -car.width / 2 + 2, 12, 7);
      ctx.fillStyle = blink ? '#3e7be2' : '#e2543e';
      ctx.fillRect(-6, car.width / 2 - 9, 12, 7);
    }
    if (car.kind === 'taxi') {
      ctx.fillStyle = '#20242e';
      for (let i = 0; i < 5; i += 1) ctx.fillRect(-car.length / 2 + 8 + i * 9, -3, 6, 6);
    }
    if (car.health < 45) {
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(-car.length * 0.25, 0, 8, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCars(world, light) {
    for (const car of world.parkedCars) drawCarShape(car, light);
    for (const car of world.traffic.cars) drawCarShape(car, light);
    for (const car of world.raceCars) drawCarShape(car, light);
    for (const car of world.police.cars) drawCarShape(car, light);
    if (world.playerCar) {
      drawCarShape(world.playerCar, light);
      // A soft ring so the eye finds the player's car instantly.
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(world.playerCar.x, world.playerCar.y, world.playerCar.length * 0.62 + 4 * Math.sin(animT * 3), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  function drawPeople(world) {
    for (const ped of world.people.peds) {
      ctx.save();
      ctx.translate(ped.x, ped.y);
      if (ped.state === 'down') {
        ctx.rotate(Math.PI / 2);
        ctx.fillStyle = ped.shirt;
        rr(ctx, -12, -6, 24, 12, 6);
        ctx.fill();
        ctx.fillStyle = ped.skin;
        ctx.beginPath();
        ctx.arc(14, 0, 6, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        continue;
      }
      ctx.rotate(ped.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(2, 3, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = ped.shirt;
      rr(ctx, -8, -7, 16, 14, 6);
      ctx.fill();
      ctx.fillStyle = ped.skin;
      ctx.beginPath();
      ctx.arc(10, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (ped.fare) {
        ctx.fillStyle = '#7ee787';
        ctx.font = 'bold 16px ' + FONT;
        ctx.textAlign = 'center';
        ctx.fillText('$', ped.x, ped.y - 18);
      }
    }
    for (const cop of world.police.cops) {
      ctx.save();
      ctx.translate(cop.x, cop.y);
      ctx.rotate(cop.angle);
      ctx.fillStyle = 'rgba(0,0,0,0.25)';
      ctx.beginPath();
      ctx.arc(2, 3, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#20242e';
      rr(ctx, -9, -8, 18, 16, 6);
      ctx.fill();
      ctx.fillStyle = '#3e7be2';
      ctx.fillRect(-9, -2, 18, 4);
      ctx.fillStyle = '#e8b98a';
      ctx.beginPath();
      ctx.arc(11, 0, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  function drawParticles(world) {
    for (const p of world.fx.particles) {
      const a = Math.max(0, p.life / p.maxLife);
      if (p.kind === 'smoke') {
        ctx.fillStyle = `rgba(70, 70, 70, ${0.4 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * (1.6 - a * 0.6), 0, Math.PI * 2);
        ctx.fill();
      } else if (p.kind === 'spark') {
        ctx.fillStyle = `rgba(255, 215, 106, ${a})`;
        ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      } else {
        ctx.fillStyle = `rgba(203, 185, 138, ${0.7 * a})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawPlayer(world) {
    if (world.playerCar) return;
    const p = world.player;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, 20 + 2 * Math.sin(animT * 3), 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(p.angle);
    if (p.punchTimer > 0) {
      ctx.fillStyle = '#f2c94c';
      ctx.beginPath();
      ctx.arc(20, 0, 7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#e2543e';
    rr(ctx, -9, -8, 18, 16, 7);
    ctx.fill();
    ctx.fillStyle = '#e8b98a';
    ctx.beginPath();
    ctx.arc(12, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#20242e';
    ctx.beginPath();
    ctx.arc(12, -2, 7, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawLights(world, light) {
    if (!light.lamps) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const glow = (x, y, r, color) => {
      const g = ctx.createRadialGradient(x, y, 2, x, y, r);
      g.addColorStop(0, color);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    };
    for (const lamp of world.city.lamps) {
      glow(lamp.x, lamp.y, 46, 'rgba(255, 200, 100, 0.20)');
    }
    const cars = [];
    if (world.playerCar) cars.push(world.playerCar);
    for (const c of world.traffic.cars) cars.push(c);
    for (const c of world.police.cars) cars.push(c);
    for (const c of cars) {
      const fx = Math.cos(c.angle);
      const fy = Math.sin(c.angle);
      const hx = c.x + fx * (c.length / 2 + 46);
      const hy = c.y + fy * (c.length / 2 + 46);
      const g = ctx.createRadialGradient(hx, hy, 4, hx, hy, 90);
      g.addColorStop(0, 'rgba(255, 233, 168, 0.30)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(c.x + fx * c.length / 2, c.y + fy * c.length / 2);
      ctx.lineTo(hx + -fy * 34, hy + fx * 34);
      ctx.lineTo(hx + fy * 34, hy - fx * 34);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD(world, light, opts) {
    const city = world.city;
    const player = world.player;
    const car = world.playerCar;
    const police = world.police;
    const missions = world.missions;
    void light;

    // ---- Top-left: cash, health, parcels.
    ctx.fillStyle = PALETTE.panel;
    rr(ctx, 12, 12, 250, 74, 10);
    ctx.fill();
    ctx.textAlign = 'left';
    ctx.fillStyle = PALETTE.money;
    ctx.font = `bold 26px ${FONT}`;
    ctx.fillText(`$${world.cash.toLocaleString()}`, 26, 42);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`earned $${world.earned.toLocaleString()}   parcels ${world.parcelsCollected}/30`, 26, 64);
    ctx.fillStyle = 'rgba(255,255,255,0.16)';
    rr(ctx, 26, 70, 222, 8, 4);
    ctx.fill();
    ctx.fillStyle = player.health > 35 ? PALETTE.health : PALETTE.healthLow;
    rr(ctx, 26, 70, 222 * Math.max(0, player.health / 100), 8, 4);
    ctx.fill();

    // ---- Wanted stars, top-centre.
    const stars = police.stars;
    const cx = VIEW.width / 2;
    for (let i = 0; i < 5; i += 1) {
      const x = cx + (i - 2) * 34;
      const pulse = stars >= 3 ? 1 + 0.12 * Math.sin(animT * 6) : 1;
      ctx.save();
      ctx.translate(x, 34);
      ctx.scale(pulse, pulse);
      starPath(ctx, 0, 0, 13);
      ctx.fillStyle = i < stars ? PALETTE.star : 'rgba(255,255,255,0.30)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    if (police.bustTimer > 0.1) {
      ctx.fillStyle = '#ff5a4e';
      ctx.font = `bold 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(`BUSTED IN ${Math.max(0, 2.5 - police.bustTimer).toFixed(1)}s — MOVE!`, cx, 74);
    }

    // ---- Mission objective, under the cash panel.
    const obj = missions.objective;
    if (obj) {
      const px = car ? car.x : player.x;
      const py = car ? car.y : player.y;
      const dist = Math.round(Math.hypot(obj.x - px, obj.y - py));
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, 12, 94, 290, 52, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('◆ ' + obj.label, 26, 116);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.fillText(`${dist}m`, 26, 136);
    } else if (missions.jobAvailable()) {
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, 12, 94, 290, 52, 10);
      ctx.fill();
      ctx.fillStyle = '#7ec8f2';
      ctx.font = `bold 15px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('◆ New job from Lena — go to the Safehouse', 26, 116);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.fillText('Safehouse, Palm Heights', 26, 136);
    }

    // ---- Taxi timer.
    if (world.taxi) {
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, 12, 154, 250, 44, 10);
      ctx.fill();
      ctx.fillStyle = '#7ee787';
      ctx.font = `bold 16px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(`Fare $${world.taxi.pay} — ${Math.max(0, world.taxi.timer).toFixed(0)}s left`, 26, 182);
    }

    // ---- Minimap, top-right, with clock and district beneath it.
    drawMinimap(world);
    const district = city.districtAt(player.x, player.y);
    ctx.fillStyle = PALETTE.panel;
    rr(ctx, VIEW.width - 216, 172, 204, 44, 10);
    ctx.fill();
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 16px ${FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText(district, VIEW.width - 202, 192);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `13px ${FONT}`;
    ctx.fillText(`${formatClock(world.timeHours)}  •  Sunset Coast`, VIEW.width - 202, 210);

    // ---- Speed and car health, bottom-right (driving only).
    if (car) {
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, VIEW.width - 216, VIEW.height - 76, 204, 64, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.font = `bold 30px ${FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${Math.round(Math.abs(car.speed) * 0.36)}`, VIEW.width - 62, VIEW.height - 36);
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.fillText('km/h', VIEW.width - 26, VIEW.height - 36);
      ctx.fillStyle = 'rgba(255,255,255,0.16)';
      rr(ctx, VIEW.width - 202, VIEW.height - 26, 176, 7, 3);
      ctx.fill();
      ctx.fillStyle = car.health > 45 ? PALETTE.health : PALETTE.healthLow;
      rr(ctx, VIEW.width - 202, VIEW.height - 26, 176 * Math.max(0, car.health / car.maxHealth), 7, 3);
      ctx.fill();
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `12px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText(car.name, VIEW.width - 202, VIEW.height - 58);
    }

    // ---- Prompt and toast.
    if (world.prompt) {
      ctx.font = `bold 17px ${FONT}`;
      const w = ctx.measureText(world.prompt).width + 34;
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, VIEW.width / 2 - w / 2, VIEW.height - 66, w, 38, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText(world.prompt, VIEW.width / 2, VIEW.height - 40);
    }
    if (world.toast) {
      ctx.font = `bold 18px ${FONT}`;
      const w = ctx.measureText(world.toast.text).width + 40;
      ctx.fillStyle = 'rgba(16, 18, 26, 0.88)';
      rr(ctx, VIEW.width / 2 - w / 2, 96, w, 40, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.text;
      ctx.textAlign = 'center';
      ctx.fillText(world.toast.text, VIEW.width / 2, 122);
    }

    // ---- Dialogue (phone call from Lena).
    if (world.dialogue) {
      const line = world.dialogue.lines[world.dialogue.index];
      if (line) {
        ctx.fillStyle = PALETTE.panel;
        rr(ctx, VIEW.width / 2 - 330, VIEW.height - 148, 660, 72, 12);
        ctx.fill();
        ctx.strokeStyle = PALETTE.panelEdge;
        ctx.lineWidth = 2;
        rr(ctx, VIEW.width / 2 - 330, VIEW.height - 148, 660, 72, 12);
        ctx.stroke();
        ctx.fillStyle = PALETTE.marker;
        ctx.font = `bold 15px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(line[0], VIEW.width / 2 - 312, VIEW.height - 120);
        ctx.fillStyle = PALETTE.text;
        ctx.font = `16px ${FONT}`;
        wrapText(line[1], VIEW.width / 2 - 312, VIEW.height - 96, 624, 20);
        ctx.fillStyle = PALETTE.muted;
        ctx.font = `12px ${FONT}`;
        ctx.textAlign = 'right';
        ctx.fillText('E — continue', VIEW.width / 2 + 312, VIEW.height - 88);
      }
    }

    // ---- Shop menu.
    if (world.shop) {
      ctx.fillStyle = 'rgba(8, 10, 16, 0.55)';
      ctx.fillRect(0, 0, VIEW.width, VIEW.height);
      const options = world.shop.options;
      const h = 92 + options.length * 40;
      ctx.fillStyle = PALETTE.panel;
      rr(ctx, VIEW.width / 2 - 260, VIEW.height / 2 - h / 2, 520, h, 14);
      ctx.fill();
      ctx.strokeStyle = PALETTE.panelEdge;
      ctx.lineWidth = 2;
      rr(ctx, VIEW.width / 2 - 260, VIEW.height / 2 - h / 2, 520, h, 14);
      ctx.stroke();
      ctx.fillStyle = PALETTE.marker;
      ctx.font = `bold 22px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(world.shop.shop.name, VIEW.width / 2, VIEW.height / 2 - h / 2 + 38);
      ctx.fillStyle = PALETTE.money;
      ctx.font = `bold 16px ${FONT}`;
      ctx.fillText(`$${world.cash.toLocaleString()}`, VIEW.width / 2, VIEW.height / 2 - h / 2 + 62);
      options.forEach((opt, i) => {
        const y = VIEW.height / 2 - h / 2 + 88 + i * 40;
        ctx.fillStyle = opt.enabled ? PALETTE.text : PALETTE.muted;
        ctx.font = `16px ${FONT}`;
        ctx.textAlign = 'left';
        ctx.fillText(`${i + 1}. ${opt.label}`, VIEW.width / 2 - 232, y);
      });
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `13px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('Press a number to buy — E to leave', VIEW.width / 2, VIEW.height / 2 + h / 2 - 14);
    }

    // ---- Off-screen objective arrow.
    const obj2 = missions.objective || (world.taxi ? { x: world.taxi.dest.x, y: world.taxi.dest.y } : null);
    if (obj2) drawEdgeArrow(world, obj2);

    // ---- Controls hint, first seconds of play.
    if (opts.hintTimer > 0) {
      ctx.fillStyle = 'rgba(16, 18, 26, 0.7)';
      rr(ctx, 12, VIEW.height - 118, 330, 100, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.muted;
      ctx.font = `14px ${FONT}`;
      ctx.textAlign = 'left';
      ctx.fillText('WASD / arrows — drive or walk', 26, VIEW.height - 92);
      ctx.fillText('E — get in / out, talk, buy', 26, VIEW.height - 70);
      ctx.fillText('SPACE — handbrake / punch   SHIFT — run', 26, VIEW.height - 48);
      ctx.fillText('P — pause   M — mute', 26, VIEW.height - 26);
    }
  }

  function wrapText(text, x, y, maxWidth, lineHeight) {
    const words = text.split(' ');
    let line = '';
    let yy = y;
    for (const word of words) {
      const test = line ? line + ' ' + word : word;
      if (ctx.measureText(test).width > maxWidth && line) {
        ctx.fillText(line, x, yy);
        line = word;
        yy += lineHeight;
      } else {
        line = test;
      }
    }
    ctx.fillText(line, x, yy);
  }

  function drawEdgeArrow(world, target) {
    const cam = world.camera;
    const vx = (target.x - cam.x) * cam.zoom + VIEW.width / 2;
    const vy = (target.y - cam.y) * cam.zoom + VIEW.height / 2;
    if (vx > 40 && vx < VIEW.width - 40 && vy > 40 && vy < VIEW.height - 40) return;
    const cx = Math.max(40, Math.min(VIEW.width - 40, vx));
    const cy = Math.max(40, Math.min(VIEW.height - 40, vy));
    const ang = Math.atan2(vy - VIEW.height / 2, vx - VIEW.width / 2);
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(ang);
    ctx.fillStyle = PALETTE.marker;
    ctx.beginPath();
    ctx.moveTo(16, 0);
    ctx.lineTo(-10, -11);
    ctx.lineTo(-10, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawMinimap(world) {
    const x0 = VIEW.width - 216;
    const y0 = 12;
    const w = 204;
    const h = 150;
    const s = w / world.city.width;
    ctx.fillStyle = 'rgba(10, 12, 18, 0.85)';
    rr(ctx, x0 - 4, y0 - 4, w + 8, h + 8, 10);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    rr(ctx, x0, y0, w, h, 6);
    ctx.clip();
    ctx.fillStyle = '#2e5d33';
    ctx.fillRect(x0, y0, w, h);
    ctx.fillStyle = '#3a3f4a';
    for (const road of world.city.roads) {
      if (road.vertical) ctx.fillRect(x0 + road.at * s - 1.5, y0, 3, h);
      else ctx.fillRect(x0, y0 + road.at * s - 1.5, w, 3);
    }
    ctx.fillStyle = '#e0c98f';
    ctx.fillRect(x0, y0 + SAND_Y * s, w, (WATER_Y - SAND_Y) * s);
    ctx.fillStyle = '#2e7fa8';
    ctx.fillRect(x0, y0 + WATER_Y * s, w, h - WATER_Y * s);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    for (const b of world.city.buildings) {
      ctx.fillRect(x0 + b.x * s, y0 + b.y * s, Math.max(2, b.w * s), Math.max(2, b.h * s));
    }
    const dot = (x, y, color, r) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(x0 + x * s, y0 + y * s, r, 0, Math.PI * 2);
      ctx.fill();
    };
    if (world.missions.objective) {
      const pulse = 3 + Math.sin(animT * 5) * 1.2;
      dot(world.missions.objective.x, world.missions.objective.y, PALETTE.marker, pulse);
    }
    if (world.taxi) dot(world.taxi.dest.x, world.taxi.dest.y, '#7ee787', 3.5);
    for (const car of world.police.cars) dot(car.x, car.y, '#5a9ef2', 2.5);
    const px = world.playerCar ? world.playerCar.x : world.player.x;
    const py = world.playerCar ? world.playerCar.y : world.player.y;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x0 + px * s, y0 + py * s, 5, 0, Math.PI * 2);
    ctx.stroke();
    dot(px, py, '#ffffff', 3);
    // Viewport rectangle.
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    const vw = VIEW.width / world.camera.zoom * s;
    const vh = VIEW.height / world.camera.zoom * s;
    ctx.strokeRect(x0 + (world.camera.x - VIEW.width / world.camera.zoom / 2) * s, y0 + (world.camera.y - VIEW.height / world.camera.zoom / 2) * s, vw, vh);
    ctx.restore();
  }

  function drawTitle(world, opts) {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.34)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.marker;
    ctx.font = `bold 84px ${FONT}`;
    ctx.fillText('SUNSET COAST', VIEW.width / 2, 218);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `22px ${FONT}`;
    ctx.fillText('Steal it. Drive it. Outrun the whole coast.', VIEW.width / 2, 262);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('An open-world crime game — five jobs, one city, no speed limit.', VIEW.width / 2, 292);
    const hasSave = opts.hasSave;
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 24px ${FONT}`;
    ctx.fillText(hasSave ? 'ENTER — Continue' : 'ENTER — New Game', VIEW.width / 2, 380);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('WASD drive & walk  •  E get in / out & talk  •  SPACE handbrake & punch', VIEW.width / 2, 428);
    ctx.fillText('SHIFT run  •  P pause  •  M mute  •  Progress saves automatically', VIEW.width / 2, 454);
    if (hasSave && opts.saveSummary) {
      ctx.fillStyle = PALETTE.money;
      ctx.font = `16px ${FONT}`;
      ctx.fillText(opts.saveSummary, VIEW.width / 2, 500);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.4)';
    ctx.font = `13px ${FONT}`;
    ctx.fillText('Sunset Coast — a make.fun entry. All names, places and cars are invented.', VIEW.width / 2, VIEW.height - 24);
  }

  function drawPaused() {
    ctx.fillStyle = 'rgba(8, 10, 18, 0.6)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `bold 56px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('PAUSED', VIEW.width / 2, VIEW.height / 2 - 10);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `18px ${FONT}`;
    ctx.fillText('P or ESC — resume', VIEW.width / 2, VIEW.height / 2 + 32);
  }

  function drawBusted(world) {
    void world;
    ctx.fillStyle = 'rgba(10, 10, 20, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = '#5a9ef2';
    ctx.font = `bold 72px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('BUSTED', VIEW.width / 2, VIEW.height / 2 - 20);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('The Sunset Coast police thank you for your cooperation.', VIEW.width / 2, VIEW.height / 2 + 28);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Your car is in the impound lot. Press E to walk free.', VIEW.width / 2, VIEW.height / 2 + 62);
  }

  function drawWasted(world) {
    void world;
    ctx.fillStyle = 'rgba(16, 8, 10, 0.72)';
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);
    ctx.fillStyle = PALETTE.danger;
    ctx.font = `bold 72px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('WASTED', VIEW.width / 2, VIEW.height / 2 - 20);
    ctx.fillStyle = PALETTE.text;
    ctx.font = `20px ${FONT}`;
    ctx.fillText('St. Marina Hospital patched you up. The bill was not small.', VIEW.width / 2, VIEW.height / 2 + 28);
    ctx.fillStyle = PALETTE.muted;
    ctx.font = `16px ${FONT}`;
    ctx.fillText('Press E to get back on your feet.', VIEW.width / 2, VIEW.height / 2 + 62);
  }

  return { draw };
}
