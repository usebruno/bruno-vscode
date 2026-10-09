type Listener = (event: Event) => void;

export const bindEvents = (target: EventTarget, listeners: Record<string, Listener>): (() => void) => {
  const entries = Object.entries(listeners);
  entries.forEach(([type, listener]) => target.addEventListener(type, listener));
  return () => entries.forEach(([type, listener]) => target.removeEventListener(type, listener));
};
