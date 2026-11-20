// Keyboard and pointer input. Held keys give a driving or walking direction; one-shot
// presses (enter a car, interact, punch, pause, confirm) are queued as bit flags and
// taken once by the loop, so a press between two frames is never lost or counted twice.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_ENTER = 4;
export const ACTION_PUNCH = 8;
export const ACTION_MUTE = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const ENTER = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, shift: false, space: false };
  let actions = 0;
  let digit = 0;

  function press(code) {
    if (UP.has(code)) held.up = true;
    else if (DOWN.has(code)) held.down = true;
    else if (LEFT.has(code)) held.left = true;
    else if (RIGHT.has(code)) held.right = true;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') held.shift = true;
    else if (code === 'Space') {
      held.space = true;
      actions |= ACTION_PUNCH;
    } else if (CONFIRM.has(code)) actions |= ACTION_CONFIRM;
    else if (PAUSE.has(code)) actions |= ACTION_PAUSE;
    else if (ENTER.has(code)) actions |= ACTION_ENTER;
    else if (MUTE.has(code)) actions |= ACTION_MUTE;
    else if (/^Digit[1-9]$/.test(code)) digit = Number(code.slice(5));
  }

  function release(code) {
    if (UP.has(code)) held.up = false;
    else if (DOWN.has(code)) held.down = false;
    else if (LEFT.has(code)) held.left = false;
    else if (RIGHT.has(code)) held.right = false;
    else if (code === 'ShiftLeft' || code === 'ShiftRight') held.shift = false;
    else if (code === 'Space') held.space = false;
  }

  window.addEventListener('keydown', (event) => {
    if (event.repeat) return;
    const before = actions;
    press(event.code);
    if (actions !== before || UP.has(event.code) || DOWN.has(event.code) || LEFT.has(event.code) || RIGHT.has(event.code)) {
      event.preventDefault();
    }
  });
  window.addEventListener('keyup', (event) => release(event.code));
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = false;
    held.down = false;
    held.left = false;
    held.right = false;
    held.shift = false;
    held.space = false;
  });
  target.addEventListener('pointerdown', () => {
    actions |= ACTION_CONFIRM;
  });

  return {
    /** -1 to 1, throttle: up is forward, down is brake/reverse. */
    throttle() {
      return (held.up ? 1 : 0) - (held.down ? 1 : 0);
    },
    /** -1 to 1, steering: left is negative. */
    steer() {
      return (held.right ? 1 : 0) - (held.left ? 1 : 0);
    },
    /** True while the run key is held. */
    running() {
      return held.shift;
    },
    /** Held keys as a walk vector, normalised. */
    walkVector() {
      const x = (held.right ? 1 : 0) - (held.left ? 1 : 0);
      const y = (held.down ? 1 : 0) - (held.up ? 1 : 0);
      if (x === 0 && y === 0) return { x: 0, y: 0 };
      const len = Math.hypot(x, y);
      return { x: x / len, y: y / len };
    },
    /** True while Space is held (handbrake in a car). */
    actionHeld() {
      return held.space;
    },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
    /** The number key pressed since the last call (1–9), or 0. */
    takeDigit() {
      const taken = digit;
      digit = 0;
      return taken;
    },
  };
}
