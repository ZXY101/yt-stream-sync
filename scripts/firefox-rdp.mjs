// A small client for Firefox's remote debugging protocol (RDP), the connection web-ext already
// uses to install the add-on in `npm run firefox`. It runs code in the add-on's background page.
// Unlike WebDriver, RDP doesn't set navigator.webdriver, so YouTube keeps playing normally.
// Protocol: https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html
import net from "node:net";

const ANSWER_TIMEOUT_MS = 15_000;
const BACKGROUND_WAIT_MS = 3000;
const WAKE_WAIT_MS = 10_000;

/** Splits the byte stream into packets: `<length>:<JSON>`. */
function packetReader(onPacket) {
  let buffer = Buffer.alloc(0);
  return function read(chunk) {
    buffer = Buffer.concat([buffer, chunk]);
    for (;;) {
      const colon = buffer.indexOf(":");
      const length = Number(buffer.subarray(0, colon).toString());
      if (colon < 1 || buffer.length < colon + 1 + length) {
        return;
      }
      onPacket(JSON.parse(buffer.subarray(colon + 1, colon + 1 + length).toString()));
      buffer = buffer.subarray(colon + 1 + length);
    }
  };
}

/** Connects to Firefox on 127.0.0.1:<port>. */
function connect(port) {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection({ port, host: "127.0.0.1" });
    const waiters = new Set();
    socket.on(
      "data",
      packetReader((packet) => waiters.forEach((waiter) => waiter(packet))),
    );
    socket.on("error", (error) => reject(new Error(`can't reach Firefox (${error.code})`)));

    /** The next packet that `matches`, e.g. an actor's answer or an event. */
    function waitFor(matches, label) {
      return new Promise((done, fail) => {
        const timer = setTimeout(() => fail(new Error(`${label}: no answer`)), ANSWER_TIMEOUT_MS);
        function waiter(packet) {
          if (matches(packet)) {
            waiters.delete(waiter);
            clearTimeout(timer);
            done(packet);
          }
        }
        waiters.add(waiter);
      });
    }

    /** Sends a request; the actor's next packet is its answer (one request per actor at a time). */
    async function request(to, type, fields = {}) {
      const answer = waitFor((packet) => packet.from === to && !packet.type, `${to} ${type}`);
      const body = Buffer.from(JSON.stringify({ to, type, ...fields }));
      socket.write(`${body.length}:`);
      socket.write(body);
      const packet = await answer;
      if (packet.error) {
        throw new Error(`${type}: ${packet.error} ${packet.message ?? ""}`);
      }
      return packet;
    }

    function listen(onPacket) {
      waiters.add(onPacket);
    }

    const greeting = waitFor((packet) => packet.from === "root", "root");
    greeting.then(() => resolve({ request, waitFor, listen, close: () => socket.end() }), reject);
  });
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** The background page's console actor, if the page is running. */
async function backgroundConsole(rdp, descriptor, waitMs = BACKGROUND_WAIT_MS) {
  const targets = [];
  rdp.listen((packet) => {
    if (packet.type === "target-available-form") {
      targets.push(packet.target);
    }
  });
  const watcher = await rdp.request(descriptor, "getWatcher", {
    isServerTargetSwitchingEnabled: true,
  });
  await rdp.request(watcher.actor, "watchTargets", { targetType: "frame" });
  // The background's target is announced shortly after the answer, not before it.
  for (let waited = 0; waited < waitMs; waited += 100) {
    const page = targets.find((target) => target.url.endsWith("/_generated_background_page.html"));
    if (page) {
      return page.consoleActor;
    }
    // oxlint-disable-next-line no-await-in-loop
    await sleep(100);
  }
  return undefined;
}

async function addonActor(rdp, addonId) {
  const { addons } = await rdp.request("root", "listAddons");
  const addon = addons.find((item) => item.id === addonId);
  if (!addon) {
    throw new Error(`${addonId} isn't installed in this Firefox`);
  }
  return addon.actor;
}

/** A connection plus the background page's console actor, or undefined if it isn't running. */
async function tryBackground(port, addonId, waitMs) {
  const rdp = await connect(port);
  const consoleActor = await backgroundConsole(rdp, await addonActor(rdp, addonId), waitMs);
  if (consoleActor) {
    return { rdp, consoleActor };
  }
  return { rdp };
}

/** Reloads the add-on, then waits on fresh connections (an old one never sees the new page). */
async function wakeBackground(port, addonId, asleep) {
  console.warn("The add-on's background was asleep; reloading the add-on to wake it.");
  await asleep.request(await addonActor(asleep, addonId), "reload");
  asleep.close();
  for (let waited = 0; waited < WAKE_WAIT_MS; waited += 1000) {
    // oxlint-disable-next-line no-await-in-loop
    await sleep(1000);
    // oxlint-disable-next-line no-await-in-loop
    const found = await tryBackground(port, addonId, 500);
    if (found.consoleActor) {
      return found;
    }
    found.rdp.close();
  }
  throw new Error("the add-on's background page didn't start");
}

/**
 * Connects to the add-on's background page in the Firefox on 127.0.0.1:<port>. Firefox suspends
 * the page after ~30 s without an open YouTube player (an event page); then the add-on is
 * reloaded to start it again. Nothing is lost by that: a suspended page holds no sync group.
 */
export async function openBackground(port, addonId) {
  let found = await tryBackground(port, addonId, BACKGROUND_WAIT_MS);
  if (!found.consoleActor) {
    found = await wakeBackground(port, addonId, found.rdp);
  }
  const { rdp, consoleActor } = found;
  return {
    evaluate: (expression) => evaluate(rdp, consoleActor, expression),
    close: () => rdp.close(),
  };
}

/** Reads a long string (over ~10 kB) that RDP sent as an actor. */
async function fullString(rdp, grip) {
  if (typeof grip !== "object" || grip?.type !== "longString") {
    return grip;
  }
  const { substring } = await rdp.request(grip.actor, "substring", {
    start: 0,
    end: grip.length,
  });
  return substring;
}

/** Runs `expression` in the page (top-level await works) and returns a string or number result. */
async function evaluate(rdp, consoleActor, expression) {
  const { resultID } = await rdp.request(consoleActor, "evaluateJSAsync", {
    text: expression,
    mapped: { await: true },
  });
  const result = await rdp.waitFor(
    (packet) => packet.type === "evaluationResult" && packet.resultID === resultID,
    "evaluation",
  );
  if (result.exceptionMessage) {
    throw new Error(String(await fullString(rdp, result.exceptionMessage)));
  }
  return fullString(rdp, result.result);
}
