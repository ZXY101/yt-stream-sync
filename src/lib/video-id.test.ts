import { parseVideoId } from "./video-id.ts";

describe("parseVideoId", () => {
  it.each([
    ["Vh-YGhqy_Mo", "Vh-YGhqy_Mo"],
    ["  Vh-YGhqy_Mo ", "Vh-YGhqy_Mo"],
    ["https://www.youtube.com/watch?v=Vh-YGhqy_Mo&t=120s", "Vh-YGhqy_Mo"],
    ["youtube.com/watch?v=Vh-YGhqy_Mo", "Vh-YGhqy_Mo"],
    ["https://m.youtube.com/watch?v=Vh-YGhqy_Mo", "Vh-YGhqy_Mo"],
    ["https://youtu.be/Vh-YGhqy_Mo?si=abc", "Vh-YGhqy_Mo"],
    ["https://www.youtube.com/live/Vh-YGhqy_Mo", "Vh-YGhqy_Mo"],
    ["https://www.youtube.com/embed/Vh-YGhqy_Mo", "Vh-YGhqy_Mo"],
  ])("finds the id in %s", (text, id) => {
    expect(parseVideoId(text)).toBe(id);
  });

  it.each(["", "hello", "https://example.com/watch?v=Vh-YGhqy_Mo", "https://youtu.be/short"])(
    "finds none in %s",
    (text) => {
      expect(parseVideoId(text)).toBeUndefined();
    },
  );
});
