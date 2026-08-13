// Dexcom Production OAuth + API endpoints.
// These are public constants — no secrets live here. Client credentials and
// the redirect URI are read from app secrets inside each function.

export const DEXCOM_AUTH_URL = "https://api.dexcom.com/v2/oauth2/login";
export const DEXCOM_TOKEN_URL = "https://api.dexcom.com/v2/oauth2/token";
export const DEXCOM_API_BASE = "https://api.dexcom.com/v3";

// Default scopes requested for the Stackd wellness experience.
export const DEXCOM_DEFAULT_SCOPE = "offline_access";