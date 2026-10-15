// Unpublished edits, kept per editor in this browser until they are published or discarded.
//
// A draft is { value, baseRevision, savedAt }. baseRevision is the live revision the draft started
// from, so publishing can tell when someone else changed the same section in the meantime.
const PREFIX = 'acs-editor-drafts-v2:';

export function createDrafts(uid, onChange = () => {}) {
  const key = PREFIX + uid;
  let drafts = {};
  let storageWorks = true;
  try {
    drafts = JSON.parse(localStorage.getItem(key) || '{}');
  } catch {
    drafts = {};
  }
  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(drafts));
      storageWorks = true;
    } catch {
      storageWorks = false; // Private windows or full storage: drafts last until the tab closes.
    }
    onChange();
  };
  return {
    get: (name) => drafts[name] || null,
    has: (name) => name in drafts,
    names: () => Object.keys(drafts).sort(),
    all: () => ({ ...drafts }),
    get storageWorks() {
      return storageWorks;
    },
    set(name, value, baseRevision) {
      drafts[name] = { value, baseRevision, savedAt: Date.now() };
      persist();
    },
    remove(name) {
      if (!(name in drafts)) return;
      delete drafts[name];
      persist();
    },
    rename(from, to) {
      if (!(from in drafts)) return;
      drafts[to] = drafts[from];
      delete drafts[from];
      persist();
    },
    clear() {
      drafts = {};
      persist();
    },
  };
}
