import type { PlayerCommand } from "../../lib/messages.ts";

/** Which players are told to listen to their audio; sends `listen` only on changes. */
export function createListenSet(send: (id: string, command: PlayerCommand) => void) {
  const listening = new Set<string>();

  function set(ids: readonly string[]) {
    const wanted = new Set(ids);
    for (const id of wanted) {
      if (!listening.has(id)) {
        send(id, { type: "listen", on: true });
      }
    }
    for (const id of listening) {
      if (!wanted.has(id)) {
        send(id, { type: "listen", on: false });
      }
    }
    listening.clear();
    wanted.forEach((id) => listening.add(id));
  }

  return { set };
}
