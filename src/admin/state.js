const state = {
  view: "dashboard",
  allItems: [],
  archive: null,
  status: null,        // null | 'saving' | 'saved' | 'error'
  statusMessage: "",
  pendingChanges: [],  // staged writes waiting for GitHub commit
};

const subscribers = [];

export function getState() {
  return state;
}

export function setState(patch) {
  Object.assign(state, patch);
  for (const fn of subscribers) fn(state);
}

export function subscribe(fn) {
  subscribers.push(fn);
  return () => {
    const i = subscribers.indexOf(fn);
    if (i !== -1) subscribers.splice(i, 1);
  };
}
