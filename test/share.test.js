// A share link carries the code in its fragment: "#v1." and the deflated
// code as base64url. See share.js.
import { describe, test, expect } from "vitest";
import gameJs from "../examples/land-of-zot.js?raw";
import { encode, decode, VERSION } from "../share.js";

describe("a share fragment", () => {
  test("carries the code there and back", async () => {
    const code = 'import * as Zot from "./zot.js";\nconst s = "héllo — ☃ 🐉";\n';
    const fragment = await encode(code);
    expect(fragment.startsWith(`${VERSION}.`)).toBe(true);
    expect(await decode(fragment)).toBe(code);
    expect(await decode("#" + fragment)).toBe(code);
  });

  test("is URL-safe and smaller than the code", async () => {
    const fragment = await encode(gameJs);
    expect(fragment).toMatch(/^v1\.[A-Za-z0-9_-]+$/);
    expect(encodeURIComponent(fragment)).toBe(fragment);
    expect(fragment.length).toBeLessThan(gameJs.length / 2);
    expect(await decode(fragment)).toBe(gameJs);
  });

  test("an empty code round-trips too", async () => {
    expect(await decode(await encode(""))).toBe("");
  });

  test("refuses a fragment without a version", async () => {
    await expect(decode("")).rejects.toThrow(/not a zot link/i);
    await expect(decode("#")).rejects.toThrow(/not a zot link/i);
    await expect(decode("eJzLSM3JyQcABiwCFQ")).rejects.toThrow(/not a zot link/i);
  });

  test("refuses a version it does not know", async () => {
    await expect(decode("v2.eJzLSM3JyQcABiwCFQ")).rejects.toThrow(/version "v2"/);
    await expect(decode("seed.abc")).rejects.toThrow(/version "seed"/);
  });

  test("refuses data that is not base64url or does not inflate", async () => {
    await expect(decode("v1.")).rejects.toThrow(/no code/);
    await expect(decode("v1.not+base64/url=")).rejects.toThrow(/base64url/);
    await expect(decode("v1.AAAAAAAAAAAA")).rejects.toThrow();
    const good = await encode("const x = 1;");
    await expect(decode(good.slice(0, -4))).rejects.toThrow();
  });
});
