// Save games: cash, mission progress, owned cars and collected parcels, in
// localStorage. Nothing else persists — the city itself is rebuilt from the seed
// every visit, so a save is a few numbers, not a world snapshot.

import { SAVE_KEY } from './config.js';

export function loadSave() {
  try {
    const raw = window.localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    return {
      cash: typeof data.cash === 'number' ? data.cash : 0,
      missionIndex: typeof data.missionIndex === 'number' ? data.missionIndex : 0,
      completed: Array.isArray(data.completed) ? data.completed : [],
      ownedCars: Array.isArray(data.ownedCars) ? data.ownedCars : ['sedan'],
      parcels: typeof data.parcels === 'number' ? data.parcels : 0,
      earned: typeof data.earned === 'number' ? data.earned : 0,
    };
  } catch {
    return null;
  }
}

export function writeSave(data) {
  try {
    window.localStorage.setItem(SAVE_KEY, JSON.stringify({
      cash: data.cash,
      missionIndex: data.missionIndex,
      completed: data.completed,
      ownedCars: data.ownedCars,
      parcels: data.parcels,
      earned: data.earned,
    }));
  } catch {
    // Storage can be off (private windows): progress then lasts this visit only.
  }
}

export function clearSave() {
  try {
    window.localStorage.removeItem(SAVE_KEY);
  } catch {
    // Nothing to do.
  }
}
