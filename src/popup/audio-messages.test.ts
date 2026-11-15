import { audioMessage } from "./audio-messages.ts";

describe("audioMessage while listening", () => {
  it("waits for steady streams before any audio is heard", () => {
    expect(audioMessage({ state: "listening", progress: 0 })?.text).toMatch(
      /Waiting for two streams/,
    );
  });

  it("shows progress once listening", () => {
    expect(audioMessage({ state: "listening", progress: 0.4 })).toEqual({
      text: "Listening to line up the audio…",
      retry: false,
      progress: 0.4,
    });
  });

  it("says it's another try after one didn't match, instead of waiting", () => {
    expect(audioMessage({ state: "listening", progress: 0, tries: 1 })?.text).toMatch(
      /Couldn't match the audio yet\. Listening again/,
    );
  });
});
