const assert = require('assert');
const fs = require('fs');
const vm = require('vm');
const path = require('path');

function createProfileEnvironment() {
  const storage = {};
  const listeners = {};
  const elements = {};

  function createElement() {
    return {
      addEventListener(eventName, callback) {
        if (eventName === 'click') listeners.click = callback;
      },
      setAttribute() {},
      focus() {},
      contains() { return false; },
      querySelector() { return null; },
      classList: { add() {}, remove() {} },
      textContent: '',
      hidden: false,
    };
  }

  const document = {
    readyState: 'complete',
    addEventListener() {},
    querySelector(selector) {
      if (selector === '#profileReset') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileStatus') {
        return elements[selector] || (elements[selector] = { textContent: '', classList: { add() {}, remove() {} } });
      }
      if (selector === '#profileToggle') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileName') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileRole') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileBadge') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileList') {
        return elements[selector] || (elements[selector] = { innerHTML: '', querySelectorAll() { return []; }, querySelector() { return null; } });
      }
      if (selector === '#profileCreate') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileRename') {
        return elements[selector] || (elements[selector] = createElement());
      }
      if (selector === '#profileResetView') {
        return elements[selector] || (elements[selector] = createElement());
      }
      return null;
    },
    querySelectorAll() { return []; },
    addEventListener() {},
  };

  const context = {
    console,
    window: {
      confirm: () => true,
      prompt: () => null,
      A11yManager: { resetAccessibilityPrefs() {} },
      lucide: { createIcons() {} },
      addEventListener() {},
      setTimeout(fn) { fn(); return 0; },
    },
    document,
    localStorage: {
      getItem(key) {
        return Object.prototype.hasOwnProperty.call(storage, key) ? storage[key] : null;
      },
      setItem(key, value) {
        storage[key] = String(value);
      },
      removeItem(key) {
        delete storage[key];
      },
    },
    setTimeout(fn) { fn(); return 0; },
  };

  context.window.localStorage = context.localStorage;
  context.window.document = document;

  const script = fs.readFileSync(path.join(__dirname, '../Frontend/profile.js'), 'utf8');
  vm.runInNewContext(script, context, { filename: 'profile.js' });

  return {
    context,
    storage,
    listeners,
  };
}

const env = createProfileEnvironment();
env.storage['cpu-simulator-profiles'] = JSON.stringify([
  { id: 'default', name: 'AK', role: 'Project user', active: false },
  { id: 'guest', name: 'Sam', role: 'Project user', active: true },
]);
env.storage['cpu-simulator-profile'] = JSON.stringify({ id: 'guest', name: 'Sam', role: 'Project user' });

vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../Frontend/profile.js'), 'utf8'), env.context, { filename: 'profile.js' });
assert.strictEqual(env.context.window.ProfileManager.getStorageScope(), 'guest');

console.log('profile storage scope test passed');
