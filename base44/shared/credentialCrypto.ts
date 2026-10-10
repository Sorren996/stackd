// AES-256-GCM encryption for sensitive credentials at rest.
//
// The encryption key is stored ONLY as an environment secret
// (DEXCOM_CREDENTIAL_ENCRYPTION_KEY) — never in code, never in the
// database. Credentials are encrypted before being written to the
// DexcomConnection entity and decrypted transiently in memory only
// by the sync service when it needs to call Dexcom.
//
// Even if an attacker gains full read access to the database, the
// ciphertext is useless without the key. The key never leaves the
// server runtime.

import { secrets } from "base44:runtime";

const KEY_HEX_LENGTH = 64; // 32 bytes = 64 hex chars

function getKey(): Uint8Array {
  const hex = secrets.get("DEXCOM_CREDENTIAL_ENCRYPTION_KEY");
  if (!hex || hex.length !== KEY_HEX_LENGTH) {
    throw new Error("DEXCOM_CREDENTIAL_ENCRYPTION_KEY must be a 32-byte hex string (64 chars). Set it in Settings → Secrets.");
  }
  const bytes = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
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

/**
 * Encrypt a plaintext string using AES-256-GCM.
 * Returns a base64 string containing the 12-byte IV + ciphertext + 16-byte auth tag.
 * Returns the plaintext as-is if the key is not set (migration grace period).
 */
export async function encryptCredential(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  let key: Uint8Array;
  try {
    key = getKey();
  } catch {
    // Key not set — return plaintext during migration grace period.
    // The sync function will fail gracefully and prompt the admin to set the key.
    return plaintext;
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["encrypt"]);

  const encoded = new TextEncoder().encode(plaintext);
  const encrypted = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv }, cryptoKey, encoded)
  );

  // Prepend IV to ciphertext
  const combined = new Uint8Array(iv.length + encrypted.length);
  combined.set(iv, 0);
  combined.set(encrypted, iv.length);

  return bytesToBase64(combined);
}

/**
 * Decrypt a credential encrypted by encryptCredential.
 * Returns the plaintext string.
 * If the value is not encrypted (no key was set at encryption time), returns it as-is.
 */
export async function decryptCredential(ciphertext: string): Promise<string> {
  if (!ciphertext) return ciphertext;

  let key: Uint8Array;
  try {
    key = getKey();
  } catch {
    // Key not set — assume the value is plaintext (migration grace period).
    return ciphertext;
  }

  let combined: Uint8Array;
  try {
    combined = base64ToBytes(ciphertext);
  } catch {
    // Not valid base64 — assume it's plaintext (un-encrypted legacy value).
    return ciphertext;
  }

  if (combined.length < 28) {
    // Too short to contain IV (12) + auth tag (16) — assume plaintext.
    return ciphertext;
  }

  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);

  try {
    const cryptoKey = await crypto.subtle.importKey("raw", key, { name: "AES-GCM" }, false, ["decrypt"]);
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, cryptoKey, encrypted);
    return new TextDecoder().decode(decrypted);
  } catch {
    // Decryption failed — could be a plaintext value or wrong key.
    // Return as-is; the Dexcom auth will fail naturally if it's wrong.
    return ciphertext;
  }
}

/**
 * Check if a value appears to be encrypted (base64 with IV+tag length).
 * Used to detect whether a stored credential needs decryption.
 */
export function isEncrypted(value: string): boolean {
  if (!value || value.length < 40) return false;
  try {
    const bytes = base64ToBytes(value);
    return bytes.length >= 28; // IV (12) + auth tag (16) minimum
  } catch {
    return false;
  }
}