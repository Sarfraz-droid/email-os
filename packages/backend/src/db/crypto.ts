import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from "node:crypto";
import { loadConfig } from "../config.js";

/**
 * Optional AES-256-GCM encryption for secrets at rest (Gmail tokens).
 *
 * Enabled when `APP_SECRET` is set. Ciphertext is stored as
 * `enc:v1:<iv>:<tag>:<data>` (all base64). Plaintext values (anything without
 * the `enc:` prefix) are passed through, so turning encryption on later is
 * seamless and local dev can skip it.
 */

const PREFIX = "enc:v1:";
let keyCache: Buffer | undefined;
let warned = false;

function key(): Buffer | undefined {
  const secret = loadConfig().appSecret;
  if (!secret) {
    if (!warned) {
      console.warn(
        "[crypto] APP_SECRET not set — Gmail tokens are stored unencrypted. Set it before deploying."
      );
      warned = true;
    }
    return undefined;
  }
  if (!keyCache) keyCache = scryptSync(secret, "email-os/token", 32);
  return keyCache;
}

export function encryptSecret(plain: string): string {
  const k = key();
  if (!k) return plain;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", k, iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, data].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  const k = key();
  if (!k) {
    throw new Error("Encrypted token found but APP_SECRET is not set.");
  }
  const [iv, tag, data] = stored
    .slice(PREFIX.length)
    .split(":")
    .map((s) => Buffer.from(s, "base64"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted token.");
  const decipher = createDecipheriv("aes-256-gcm", k, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}
