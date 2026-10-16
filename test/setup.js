// Every Zot.Game listens for keys on window and never stops, so a key pressed in
// one test would reach the games of the tests before it. Forget them after each test.
import { afterEach } from "vitest";

const keyListeners = [];
const addEventListener = window.addEventListener;
window.addEventListener = function (type, listener, options) {
  if (type === "keydown") keyListeners.push(listener);
  return addEventListener.call(this, type, listener, options);
};

afterEach(() => {
  for (const listener of keyListeners.splice(0)) window.removeEventListener("keydown", listener);
  document.querySelectorAll(".zot-test-mount").forEach((el) => el.remove());
});
