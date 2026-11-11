import { ext } from "../lib/browser.ts";
import { originPattern } from "../lib/ytdlpz.ts";

/** Firefox's data consent rides along with permissions where the browser supports it. */
type Permissions = chrome.permissions.Permissions & { data_collection?: string[] };

/**
 * Whether the browser has Firefox's built-in data consent (getAll() then reports a
 * data_collection list). Checked when the page opens: asking for permission must happen
 * straight from the click, without waiting for anything first.
 */
export async function supportsDataConsent(): Promise<boolean> {
  const granted = (await ext.permissions.getAll()) as Permissions;
  return Array.isArray(granted.data_collection);
}

// Alignment sends the links of streams you watch to your server, which Firefox counts as
// "browsing activity" even though the server is your own.
function access(address: string, dataConsent: boolean): Permissions {
  const origins = [originPattern(address)];
  return dataConsent ? { origins, data_collection: ["browsingActivity"] } : { origins };
}

/**
 * Asks the browser to let the add-on talk to this server. Call it first thing in a click:
 * outside one the browser refuses, which counts as not allowed.
 */
export function requestAccess(address: string, dataConsent: boolean): Promise<boolean> {
  return ext.permissions.request(access(address, dataConsent)).catch(() => false);
}

/** Gives the access back when alignment is turned off. */
export async function releaseAccess(address: string, dataConsent: boolean): Promise<void> {
  await ext.permissions.remove(access(address, dataConsent)).catch(() => false);
}
