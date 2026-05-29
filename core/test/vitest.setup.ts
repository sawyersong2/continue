import { TextDecoder, TextEncoder } from "util";

import fetch, { Request, Response } from "node-fetch";
import { beforeAll } from "vitest";

beforeAll(() => {
  // @ts-ignore
  globalThis.fetch = fetch;
  // @ts-ignore
  globalThis.Request = Request;
  // @ts-ignore
  globalThis.Response = Response;
  globalThis.TextEncoder = TextEncoder as any;
  // @ts-ignore
  globalThis.TextDecoder = TextDecoder;
});
