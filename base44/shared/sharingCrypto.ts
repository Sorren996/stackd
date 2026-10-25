// Server-side cryptography for the Stackd sharing feature.
//
// Two independent secrets, both server-only:
//   SHARING_DATA_ENCRYPTION_KEY — 32 bytes hex. AES-256-GCM for private fields
//     (contact number, latest coordinates). Never stored alongside ciphertext.
//   SHARING_TOKEN_HASH_KEY      — any high-entropy string >= 32 chars. HMAC-SHA256
//     key for invitation token hashes, so a database leak alone cannot let an
//     attacker reverse a token or forge one.
//
// This module FAILS CLOSED. No key, or anything that is not valid v1
// ciphertext, throws. It never falls back to storing or returning plaintext.
//
// Note: this module is intentionally NOT imported by any test file — it depends
// on the Base44 runtime `secrets` binding. The pure, testable sharing logic
// lives in ./sharingCore.ts.

import { secrets } from "base44:runtime";

const PREFIX = "v1:";

function getDataKeyHex(): string {
  const hex = secrets.get("SHARING_DATA_ENCRYPTION_KEY") || "";
  return /^[0-9a-fA-F]{64}$/.test(hex) ? hex : "";
}

function getTokenHashKey(): string {
  const key = secrets.get("SHARING_TOKEN_HASH_KEY") || "";
  return key.length >= 32 ? key : "";
}

/** True when both sharing secrets are present and well-formed. */
export function isSharingCryptoConfigured(): boolean {
  return getDataKeyHex() !== "" && getTokenHashKey() !== "";
}

/** Which secret names are missing — surfaced to the owner as a setup notice. */
export function missingSharingSecrets(): string[] {
  const missing: string[] = [];
  if (getDataKeyHex() === "") missing.push("SHARING_DATA_ENCRYPTION_KEY");
  if (getTokenHashKey() === "") missing.push("SHARING_TOKEN_HASH_KEY");
  return missing;
}

function requireDataKey(): Uint8Array {
  const hex = getDataKeyHex();
  if (!hex) {
    throw new Error("Sharing data encryption key is not configured.");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Encrypt a value for private-field storage. */
export async function encryptSharingValue(plaintext: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", requireDataKey(), { name: "AES-GCM" }, false, [
    "encrypt",
  ]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  return PREFIX + bytesToBase64(new Uint8Array([...iv, ...new Uint8Array(cipher)]));
}

/** Decrypt a private field. Throws rather than returning a plaintext fallback. */
export async function decryptSharingValue(ciphertext: string): Promise<string> {
  if (typeof ciphertext !== "string" || !ciphertext.startsWith(PREFIX)) {
    throw new Error("Sharing value is not valid v1 ciphertext.");
  }
  const raw = base64ToBytes(ciphertext.slice(PREFIX.length));
  const iv = raw.slice(0, 12);
  const body = raw.slice(12);
  const key = await crypto.subtle.importKey("raw", requireDataKey(), { name: "AES-GCM" }, false, [
    "decrypt",
  ]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, body);
  return new TextDecoder().decode(plain);
}

/**
 * Generate an opaque, high-entropy invitation token (32 random bytes,
 * base64url). This value exists only inside the emailed link — it is never
 * persisted and never logged.
 */
export function generateInviteToken(): string {
  return bytesToBase64(crypto.getRandomValues(new Uint8Array(32)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Keyed hash of an invitation token, for lookup. */
export async function hashInviteToken(token: string): Promise<string> {
  const keyHex = getTokenHashKey();
  if (!keyHex) {
    throw new Error("Sharing token hash key is not configured.");
  }
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(keyHex),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(token));
  return toHex(new Uint8Array(sig));
}