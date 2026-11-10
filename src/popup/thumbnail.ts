// YouTube video ids are 11 characters from this set. Anything else is never put in a URL.
const VIDEO_ID = /^[\w-]{11}$/;

/**
 * The video's thumbnail from YouTube's image server. This is the add-on's only request of
 * its own, and only for videos the user already has open.
 */
export function thumbnailUrl(videoId: string): string | undefined {
  return VIDEO_ID.test(videoId) ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : undefined;
}
