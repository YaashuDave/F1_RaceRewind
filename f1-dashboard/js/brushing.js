import { state } from './state.js';

const listeners = new Map();

export function on(event, callback) {
  if (!listeners.has(event)) {
    listeners.set(event, []);
  }
  listeners.get(event).push(callback);
}

export function emit(event, newState = {}) {
  Object.assign(state, newState);
  if (listeners.has(event)) {
    listeners.get(event).forEach((callback) => callback(state));
  }
  if (listeners.has('*')) {
    listeners.get('*').forEach((callback) => callback(state));
  }
}
