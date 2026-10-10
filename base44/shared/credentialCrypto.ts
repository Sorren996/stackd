// AES-256-GCM encryption for sensitive credentials at rest.
//
// The key is stored ONLY as the DEXCOM_CREDENTIAL_ENCRYPTION_KEY server
// secret (32 bytes, hex) — never in code or the database.
//
// Format: "v1:" + base64(iv[12] | ciphertext | authTag[16]).
// This module fails CLOSED: no key → throw; anything that isn't valid v1
// ciphertext → throw. It never stores or returns plaintext as a fallback.

import { secrets } from "base44:runtime";

const PREFIX = "v1:";

function getKeyBytes(): Uint8Array {
  const hex = secrets.get("DEXCOM_CREDENTIAL_ENCRYPTION_KEY") || "";
  if (!/^[0-9a-fA-F]{64}$/.test(hex)) {
    throw new Error("Credential encryption key is not configured.");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

async function importKey(usage: "encrypt" | "decrypt") {
  return crypto.subtle.importKey("raw", getKeyBytes(), { name: "AES-GCM" }, false, [usage]);
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

export function isEncrypted(value: string): boolean {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export async function encryptCredential(plaintext: string): Promise<string> {
  if (!plaintext) throw new Error("Nothing to encrypt.");
  const key = await importKey("encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plaintext))
  );
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);
  return PREFIX + bytesToBase64(combined);
}

export async function decryptCredential(ciphertext: string): Promise<string> {
  if (!isEncrypted(ciphertext)) throw new Error("Stored credential is not encrypted.");
  const combined = base64ToBytes(ciphertext.slice(PREFIX.length));
  if (combined.length < 29) throw new Error("Stored credential is malformed.");
  const key = await importKey("decrypt");
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: combined.slice(0, 12) },
    key,
    combined.slice(12)
  );
  return new TextDecoder().decode(decrypted);
}