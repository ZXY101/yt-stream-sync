/** -125.3 → "-2:05.3", 0.3 → "+0.3": the offset as the user types it. */
export function offsetToText(seconds: number): string {
  const sign = seconds < 0 ? "-" : "+";
  const tenths = Math.round(Math.abs(seconds) * 10);
  const whole = Math.floor(tenths / 10);
  const fraction = tenths % 10;
  if (whole < 60) {
    return `${sign}${whole}.${fraction}`;
  }
  const minutes = Math.floor(whole / 60);
  const rest = String(whole % 60).padStart(2, "0");
  return `${sign}${minutes}:${rest}.${fraction}`;
}

const OFFSET_PATTERN = /^([+-]?)(?:(\d+):)?(?:(\d+):)?(\d+(?:\.\d*)?|\.\d+)\s*s?$/;

/**
 * What the user typed as an offset, in seconds: "-125.3", "-2:05.3", "1:02:03", "+4 s".
 * Undefined if it isn't one.
 */
export function textToOffset(text: string): number | undefined {
  const match = OFFSET_PATTERN.exec(text.trim().replace("−", "-"));
  if (match === null) {
    return undefined;
  }
  const [, sign, first, second, last] = match;
  const parts = [first, second].filter((part) => part !== undefined).map(Number);
  const seconds = parts.reduce((total, part) => total * 60 + part * 60, 0) + Number(last);
  return sign === "-" ? -seconds : seconds;
}
