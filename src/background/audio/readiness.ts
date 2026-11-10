/** How long each player has been playing in sync, so clips hold only settled audio. */
export function createReadiness(now: () => number) {
  const settledSince = new Map<string, number>();

  /** Updates from this step's members; returns each one's settled seconds (0: not settled). */
  function update(members: readonly { id: string; settled: boolean }[]): Map<string, number> {
    const time = now();
    const seconds = new Map<string, number>();
    for (const member of members) {
      if (!member.settled) {
        settledSince.delete(member.id);
      } else if (!settledSince.has(member.id)) {
        settledSince.set(member.id, time);
      }
      seconds.set(member.id, time - (settledSince.get(member.id) ?? time));
    }
    return seconds;
  }

  return { update, reset: () => settledSince.clear() };
}
