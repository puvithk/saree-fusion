// Saved simulation designs, stored per user in localStorage.
// Each entry is small: a ~30 KB JPEG thumbnail plus colour / layout metadata.

const MAX_ENTRIES = 30;
const keyFor = (user) => `sf_saved_simulations:${user?.email || 'guest'}`;

export function loadSavedSimulations(user) {
  try {
    return JSON.parse(localStorage.getItem(keyFor(user))) || [];
  } catch {
    return [];
  }
}

// Insert or replace by id (one entry per simulation session), newest first
export function upsertSavedSimulation(user, entry) {
  const list = loadSavedSimulations(user).filter((e) => e.id !== entry.id);
  list.unshift(entry);
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(list.slice(0, MAX_ENTRIES)));
    return true;
  } catch (err) {
    console.error('Could not save simulation (storage full?)', err);
    return false;
  }
}

export function deleteSavedSimulation(user, id) {
  const list = loadSavedSimulations(user).filter((e) => e.id !== id);
  try {
    localStorage.setItem(keyFor(user), JSON.stringify(list));
  } catch { /* ignore */ }
  return list;
}
