import type { MediaEvent } from "./user-actions.ts";

const MEDIA_EVENTS: readonly MediaEvent[] = ["seeked", "play", "pause", "ratechange"];

/**
 * Listens to the media events of the player's current video element. YouTube can swap the
 * element, so `watch` moves the listeners to whichever element is current.
 */
export function createMediaWatcher(onEvent: (event: MediaEvent) => void) {
  let watched: HTMLVideoElement | undefined;

  function handle(event: Event) {
    onEvent(event.type as MediaEvent);
  }

  function watch(video: HTMLVideoElement) {
    if (watched === video) {
      return;
    }
    for (const name of MEDIA_EVENTS) {
      watched?.removeEventListener(name, handle);
      video.addEventListener(name, handle);
    }
    watched = video;
  }

  return { watch };
}
