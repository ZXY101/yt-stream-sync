/** How long each player has been playing in sync, so clips hold only settled audio. */
export function createReadiness(now: () => number) {
  const settledSince = new Map<string, number>();

  /** Updates from this step's members; returns the shortest settled time among them. */
  function update(members: readonly { id: string; settled: boolean }[]): number {
    const time = now();
    for (const member of members) {
      if (!member.settled) {
        settledSince.delete(member.id);
      } else if (!settledSince.has(member.id)) {
        settledSince.set(member.id, time);
      }
    }
    const times = members.map((member) => time - (settledSince.get(member.id) ?? time));
    return times.length > 0 ? Math.min(...times) : 0;
  }

  return { update, reset: () => settledSince.clear() };
}
