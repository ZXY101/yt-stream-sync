import { thumbnailUrl } from "../../popup/thumbnail.ts";

const MAX_SHOWN = 3;

interface ThumbnailStackProps {
  videoIds: string[];
  /** "sm" for list rows, "md" for the open group's card. */
  size?: "sm" | "md";
}

/** A saved group's thumbnails fanned out over each other, so groups are easy to tell apart. */
export function ThumbnailStack({ videoIds, size = "sm" }: ThumbnailStackProps) {
  const shown = videoIds.slice(0, MAX_SHOWN);
  const width = size === "sm" ? 48 : 64;
  const step = size === "sm" ? 8 : 10;
  return (
    <div
      className="relative shrink-0"
      style={{ width: width + step * Math.max(0, shown.length - 1), height: (width * 9) / 16 }}
      aria-hidden="true"
    >
      {shown.map((videoId, index) => {
        const url = thumbnailUrl(videoId);
        return (
          <div
            key={videoId}
            className="absolute top-0 aspect-video overflow-hidden rounded-md bg-muted ring-2 ring-card"
            style={{ left: index * step, width, zIndex: MAX_SHOWN - index }}
          >
            {url && <img src={url} alt="" className="size-full object-cover" />}
          </div>
        );
      })}
    </div>
  );
}
