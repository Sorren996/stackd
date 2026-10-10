// Server-only Dexcom credential vault.
//
// Credentials live in DexcomCredential, whose RLS denies every app user
// (including admins) read/create/update/delete. Only the service role used
// inside backend functions can touch it, and values are AES-256-GCM
// ciphertext. DexcomConnection holds status metadata only — no credentials.

import { encryptCredential, decryptCredential } from "./credentialCrypto.ts";

export async function saveDexcomCredentials(sr: any, userId: string, connectionId: string, username: string, password: string) {
  await deleteDexcomCredentials(sr, userId);
  await sr.entities.DexcomCredential.create({
    user_id: userId,
    connection_id: connectionId,
    username_enc: await encryptCredential(username),
    password_enc: await encryptCredential(password),
    key_version: "v1",
  });
}

// Decrypts transiently in memory for a single Dexcom call. Returns null when
// the user has no stored credentials.
export async function loadDexcomCredentials(sr: any, userId: string): Promise<{ username: string; password: string } | null> {
  const rows = await sr.entities.DexcomCredential.filter({ user_id: userId }, "-created_date", 1);
  const row = rows?.[0];
  if (!row?.username_enc || !row?.password_enc) return null;
  return {
    username: await decryptCredential(row.username_enc),
    password: await decryptCredential(row.password_enc),
  };
}

export async function deleteDexcomCredentials(sr: any, userId: string) {
  await sr.entities.DexcomCredential.deleteMany({ user_id: userId });
}