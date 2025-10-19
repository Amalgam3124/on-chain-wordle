// Minimal AsyncStorage stub for browser builds to satisfy @metamask/sdk
const store = new Map();

const AsyncStorage = {
  setItem: async (key, value) => {
    store.set(String(key), String(value));
    return null;
  },
  getItem: async (key) => {
    const v = store.get(String(key));
    return v === undefined ? null : v;
  },
  removeItem: async (key) => {
    store.delete(String(key));
    return null;
  },
  clear: async () => {
    store.clear();
    return null;
  },
};

module.exports = AsyncStorage;
module.exports.default = AsyncStorage;