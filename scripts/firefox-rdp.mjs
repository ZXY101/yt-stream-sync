// A small client for Firefox's remote debugging protocol (RDP), the connection web-ext already
// uses to install the add-on in `npm run firefox`. It reads from the add-on's background page.
// Unlike WebDriver, RDP doesn't set navigator.webdriver, so YouTube keeps playing normally.
// Protocol: https://firefox-source-docs.mozilla.org/devtools/backend/protocol.html
import net from "node:net";

const ANSWER_TIMEOUT_MS = 15_000;
const BACKGROUND_WAIT_MS = 3000;

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
async function backgroundConsole(rdp, descriptor) {
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
  // Pages are announced shortly after the answer, not before it.
  for (let waited = 0; waited < BACKGROUND_WAIT_MS; waited += 100) {
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

/**
 * Connects to the add-on's background page in the Firefox on 127.0.0.1:<port>. Read-only use:
 * this never wakes or reloads the add-on. Firefox suspends the page (an event page) after ~30 s
 * without an open YouTube player; it starts again when a player opens.
 */
export async function openBackground(port, addonId) {
  const rdp = await connect(port);
  const consoleActor = await backgroundConsole(rdp, await addonActor(rdp, addonId));
  if (!consoleActor) {
    rdp.close();
    throw new Error("the add-on's background is asleep: no YouTube player is open");
  }
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
