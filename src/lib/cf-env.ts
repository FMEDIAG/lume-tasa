/**
 * Cloudflare Workers bindings/secrets resolver.
 *
 * Why this exists:
 * The Worker entry that actually receives `(request, env, ctx)` is Nitro's
 * module handler (`.output/server/index.mjs`), which stores the bindings on
 * `globalThis.__env__` before dispatching. TanStack Start then calls our
 * `src/server.ts` entry through Nitro's lazy SSR service, which forwards ONLY
 * the `Request` — so the `env` argument of our fetch handler is always
 * `undefined` on Workers. `process.env` is not populated either.
 *
 * So the only reliable sources are:
 *   1. `globalThis.__env__`  (set by Nitro's cloudflare-module preset)
 *   2. `request.runtime.cloudflare.env` (set by Nitro's `augmentReq`)
 *
 * We normalise both into `globalThis.CLOUDFLARE_ENV`, which is what the AI
 * helpers, the server functions and the PayPal webhook read.
 */

export type CloudflareEnv = Record<string, unknown>;

declare global {
  // eslint-disable-next-line no-var
  var CLOUDFLARE_ENV: CloudflareEnv | undefined;
  // eslint-disable-next-line no-var
  var __env__: CloudflareEnv | undefined;
}

function asRecord(value: unknown): CloudflareEnv | undefined {
  if (value && typeof value === "object") return value as CloudflareEnv;
  return undefined;
}

/**
 * Resolve the Cloudflare env for the current request and cache it on
 * `globalThis.CLOUDFLARE_ENV`. Safe to call multiple times per request.
 */
export function resolveCloudflareEnv(request?: Request): CloudflareEnv | undefined {
  const g = globalThis as unknown as {
    CLOUDFLARE_ENV?: CloudflareEnv;
    __env__?: CloudflareEnv;
  };

  const fromRequest = asRecord(
    (request as unknown as { runtime?: { cloudflare?: { env?: unknown } } })
      ?.runtime?.cloudflare?.env,
  );
  const env = asRecord(g.__env__) ?? fromRequest;

  if (env) g.CLOUDFLARE_ENV = env;
  return env;
}

/** Read a string secret/variable from the resolved Cloudflare env. */
export function cfSecret(name: string, request?: Request): string | undefined {
  const g = globalThis as unknown as { CLOUDFLARE_ENV?: CloudflareEnv };
  const env = g.CLOUDFLARE_ENV ?? resolveCloudflareEnv(request);
  const value = env?.[name];
  if (typeof value === "string" && value.length > 0) return value;
  if (typeof process !== "undefined") {
    const fromProcess = process.env?.[name];
    if (fromProcess && fromProcess.length > 0) return fromProcess;
  }
  return undefined;
}
