import { takeOver } from "./single-copy.ts";

describe("takeOver", () => {
  it("stops the copy that was running before", () => {
    const page = {};
    const stopOld = vi.fn<() => void>();
    const stopNew = vi.fn<() => void>();

    takeOver(page, stopOld);
    takeOver(page, stopNew);

    expect(stopOld).toHaveBeenCalledOnce();
    expect(stopNew).not.toHaveBeenCalled();
  });
});
