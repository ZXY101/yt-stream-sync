import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { OptionsApp } from "./options-app.tsx";

const { storage, permissions, fetchMock, sendMessage } = vi.hoisted(() => {
  const data: Record<string, unknown> = {};
  return {
    storage: {
      data,
      get: vi.fn<(key: string) => Promise<Record<string, unknown>>>(async (key) => ({
        [key]: data[key],
      })),
      set: vi.fn<(values: Record<string, unknown>) => Promise<unknown>>(async (values) =>
        Object.assign(data, values),
      ),
    },
    permissions: {
      getAll: vi.fn<() => Promise<unknown>>(),
      request: vi.fn<(wanted: unknown) => Promise<boolean>>(),
      remove: vi.fn<(access: unknown) => Promise<boolean>>(),
    },
    fetchMock: vi.fn<typeof fetch>(),
    sendMessage: vi.fn<(message: unknown) => Promise<unknown>>(),
  };
});
vi.mock("../lib/browser.ts", () => ({
  ext: { storage: { local: storage }, permissions, runtime: { sendMessage } },
}));

const NOT_FOUND = { detail: "No such alignment" };

function respond(status: number, body: unknown) {
  fetchMock.mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

async function fillIn(address: string, token: string) {
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Server address"), address);
  await user.type(screen.getByLabelText("API token"), token);
  return user;
}

describe("OptionsApp tabs", () => {
  beforeEach(() => {
    sendMessage.mockResolvedValue(undefined);
    permissions.getAll.mockResolvedValue({ permissions: [], data_collection: [] });
  });

  it("opens on saved groups and switches tabs with the address", async () => {
    window.location.hash = "";
    const user = userEvent.setup();
    render(<OptionsApp />);
    expect(await screen.findByText("No saved groups yet.")).toBeVisible();
    await user.click(screen.getByRole("tab", { name: "Settings" }));
    expect(window.location.hash).toBe("#settings");
    expect(await screen.findByText("Align archives with yt-dlp-z")).toBeVisible();
    window.location.hash = "#groups";
    expect(await screen.findByText("No saved groups yet.")).toBeVisible();
  });
});

describe("OptionsApp settings", () => {
  beforeEach(() => {
    window.location.hash = "#settings";
    sendMessage.mockResolvedValue(undefined);
    for (const key of Object.keys(storage.data)) {
      delete storage.data[key];
    }
    vi.stubGlobal("fetch", fetchMock);
    permissions.getAll.mockResolvedValue({ permissions: [], data_collection: [] });
    permissions.request.mockResolvedValue(true);
    permissions.remove.mockResolvedValue(true);
  });

  it("explains the feature and how to set it up", async () => {
    render(<OptionsApp />);
    expect(await screen.findByText("Align archives with yt-dlp-z")).toBeVisible();
    expect(screen.getByText("Off")).toBeVisible();
    expect(screen.getByText(/What leaves your browser/)).toBeVisible();
    expect(screen.getByText(/make a token with full access/)).toBeVisible();
    expect(screen.getByRole("link", { name: "yt-dlp-z" })).toHaveAttribute(
      "href",
      "https://github.com/ZXY101/yt-dlp-z",
    );
  });

  it("asks for access, tests the server and turns alignment on", async () => {
    respond(404, NOT_FOUND);
    render(<OptionsApp />);
    const user = await fillIn("server.test:9742/", "fake-token");
    await user.click(screen.getByRole("button", { name: "Turn on" }));

    expect(await screen.findByText("Connected. Alignment is on.")).toBeVisible();
    expect(permissions.request).toHaveBeenCalledWith({
      origins: ["http://server.test/*"],
      data_collection: ["browsingActivity"],
    });
    expect(storage.data.ytdlpz).toEqual({
      enabled: true,
      address: "http://server.test:9742",
      token: "fake-token",
    });
    expect(screen.getByText("On")).toBeVisible();
  });

  it("doesn't ask for data consent where the browser has none (Chrome)", async () => {
    permissions.getAll.mockResolvedValue({ permissions: [] });
    respond(404, NOT_FOUND);
    render(<OptionsApp />);
    const user = await fillIn("https://server.test", "fake-token");
    await waitFor(() => expect(permissions.getAll).toHaveBeenCalled());
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    await screen.findByText("Connected. Alignment is on.");
    expect(permissions.request).toHaveBeenCalledWith({ origins: ["https://server.test/*"] });
  });

  it("stays off when access is refused or the test fails", async () => {
    permissions.request.mockResolvedValueOnce(false);
    respond(401, {});
    render(<OptionsApp />);
    const user = await fillIn("https://server.test", "wrong");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText(/needs your permission/)).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("yt-dlp-z didn't accept this API token.")).toBeVisible();
    expect(storage.data.ytdlpz).toBeUndefined();
  });

  it("rejects what isn't an address", async () => {
    render(<OptionsApp />);
    const user = await fillIn("http://", "fake");
    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(await screen.findByText("That isn't a web address.")).toBeVisible();
    expect(permissions.request).not.toHaveBeenCalled();
  });

  it("turns off and gives the access back", async () => {
    storage.data.ytdlpz = { enabled: true, address: "https://server.test", token: "fake" };
    render(<OptionsApp />);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Turn off" }));
    expect(await screen.findByText("Alignment is off.")).toBeVisible();
    expect(storage.data.ytdlpz).toEqual({
      enabled: false,
      address: "https://server.test",
      token: "fake",
    });
    expect(permissions.remove).toHaveBeenCalledWith({
      origins: ["https://server.test/*"],
      data_collection: ["browsingActivity"],
    });
  });
});
