const MAX_EVENTS = 500;
const events = [];

export function pushEvent(kind, data = {}) {
  const ev = { ts: Date.now(), kind, ...data };
  events.push(ev);
  if (events.length > MAX_EVENTS) events.splice(0, events.length - MAX_EVENTS);
  return ev;
}

export function listEvents(limit = 120) {
  return events.slice(-limit);
}
