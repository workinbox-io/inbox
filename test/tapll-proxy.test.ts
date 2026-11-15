import { afterEach, expect, it, vi } from "vitest";
import { proxyTapll } from "../src/lib/server/tapll-proxy";

afterEach(() => vi.unstubAllGlobals());

function proxy(path: string, method = "GET") {
  const url = new URL(`https://workinbox.io/_tapll/${path}`);
  const request = new Request(url, {
    method,
    headers: { Cookie: "session=secret", Authorization: "Bearer secret", "Content-Type": "application/json" },
    ...(method === "POST" ? { body: '{"event":"test"}' } : {}),
  });
  return proxyTapll(request);
}

it("serves the CDN script without forwarding credentials or upstream cookies", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response("script", { headers: { "Content-Type": "application/javascript", "Set-Cookie": "secret" } }));
  vi.stubGlobal("fetch", fetch);
  const response = await proxy("u.js");
  expect(String(fetch.mock.calls[0][0])).toBe("https://cdn.tapll.com/v0/u.js");
  const headers = fetch.mock.calls[0][1].headers as Headers;
  expect(headers.get("cookie")).toBeNull();
  expect(headers.get("authorization")).toBeNull();
  expect(headers.get("origin")).toBe("https://workinbox.io");
  expect(response.headers.get("set-cookie")).toBeNull();
  expect(await response.text()).toBe("script");
});

it("forwards collection bodies and preserves upstream rejection", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 403 }));
  vi.stubGlobal("fetch", fetch);
  expect((await proxy("v1/collect", "POST")).status).toBe(403);
  expect(String(fetch.mock.calls[0][0])).toBe("https://in.tapll.com/v1/collect");
  expect(await new Response(fetch.mock.calls[0][1].body).text()).toBe('{"event":"test"}');
});

it("rejects unrelated routes and handles unavailable upstreams", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  expect((await proxy("other")).status).toBe(404);
  expect(fetch).not.toHaveBeenCalled();
  expect((await proxy("u.js")).status).toBe(502);
});

it("uses Workers-compatible manual redirects and never follows another upstream", async () => {
  const fetch = vi.fn().mockResolvedValue(new Response(null, { status: 302, headers: { Location: "https://other.test" } }));
  vi.stubGlobal("fetch", fetch);
  expect((await proxy("u.js")).status).toBe(502);
  expect(fetch.mock.calls[0][1].redirect).toBe("manual");
  expect(fetch).toHaveBeenCalledTimes(1);
});
