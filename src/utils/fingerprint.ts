import type { H3Event, RequestFingerprintOptions } from "../types";
import crypto from "uncrypto";
import { _kRaw } from "../event";
import { getRequestIP } from "./request";

/**
 *
 * Get a unique fingerprint for the incoming request.
 *
 * @experimental Behavior of this utility might change in the future versions
 */
export async function getRequestFingerprint(
  event: H3Event,
  opts: RequestFingerprintOptions = {},
): Promise<string | null> {
  const fingerprint: unknown[] = [];

  if (opts.ip !== false) {
    fingerprint.push(
      getRequestIP(event, { xForwardedFor: opts.xForwardedFor }),
    );
  }

  if (opts.method === true) {
    fingerprint.push(event.method);
  }

  if (opts.path === true) {
    fingerprint.push(event.path);
  }

  if (opts.userAgent === true) {
    fingerprint.push(event[_kRaw].getHeader("user-agent"));
  }

  const fingerprintString = fingerprint.filter(Boolean).join("|");

  if (!fingerprintString) {
    return null;
  }

  if (opts.hash === false) {
    return fingerprintString;
  }

  const buffer = await crypto.subtle.digest(
    opts.hash || "SHA-1",
    new TextEncoder().encode(fingerprintString),
  );

  const hash = [...new Uint8Array(buffer)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hash;
}
