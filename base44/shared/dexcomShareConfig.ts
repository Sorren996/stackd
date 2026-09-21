// Dexcom Share API configuration.
//
// The Share API is an undocumented, reverse-engineered interface used by the
// Dexcom G7 / Dexcom Follow mobile applications. It is NOT part of the official
// Dexcom Developer API (which uses OAuth 2.0 and the /v3 endpoints).
//
// Share authenticates with the PRIMARY account's username/password and returns
// near-real-time glucose readings — typically within minutes of the sensor
// reading, compared to the ~1-hour delay of the US G7 API V3 data.
//
// These are public constants (application IDs, endpoint paths, base URLs) — no
// secrets live here. User credentials are read from app secrets inside each
// function that uses this config.

// Base URLs per region. US uses share2, outside-US uses shareous1, Japan uses
// share.dexcom.jp.
export const DEXCOM_SHARE_BASE_URL_US = "https://share2.dexcom.com/ShareWebServices/Services/";
export const DEXCOM_SHARE_BASE_URL_OUS = "https://shareous1.dexcom.com/ShareWebServices/Services/";
export const DEXCOM_SHARE_BASE_URL_JP = "https://share.dexcom.jp/ShareWebServices/Services/";

// Application IDs — hardcoded constants extracted from the Dexcom mobile apps.
// These identify the Share service client; they are not secret.
export const DEXCOM_SHARE_APPLICATION_ID_US = "d89443d2-327c-4a6f-89e5-496bbb0317db";
export const DEXCOM_SHARE_APPLICATION_ID_JP = "d8665ade-9673-4e27-9ff6-92db4ce13d13";

// Endpoints (appended to the base URL).
export const DEXCOM_SHARE_AUTHENTICATE_ENDPOINT = "General/AuthenticatePublisherAccount";
export const DEXCOM_SHARE_LOGIN_ENDPOINT = "General/LoginPublisherAccountById";
export const DEXCOM_SHARE_READINGS_ENDPOINT = "Publisher/ReadPublisherLatestGlucoseValues";

// User-Agent — mimics the official Dexcom Follow app, which Share servers
// accept. Required on all Share requests; some servers reject missing UAs.
export const DEXCOM_SHARE_USER_AGENT = "Dexcom Follow/5.0.0.0";

// Headers for auth requests (AuthenticatePublisherAccount, LoginPublisherAccountById).
// These endpoints expect a JSON request body, so Content-Type is required.
export const DEXCOM_SHARE_AUTH_HEADERS = {
  "Content-Type": "application/json",
  "User-Agent": DEXCOM_SHARE_USER_AGENT,
};

// Headers for readings requests (ReadPublisherLatestGlucoseValues).
// MUST NOT include Content-Type and MUST send an empty body — some Share
// servers silently return [] when given Content-Type: application/json
// with a stub {} body. Match xdrip4ios/FLwatch read-path shape exactly:
// only Accept + User-Agent, empty body.
export const DEXCOM_SHARE_READINGS_HEADERS = {
  "Accept": "application/json",
  "User-Agent": DEXCOM_SHARE_USER_AGENT,
};

// Backward-compatible alias — auth headers are the "default" Share headers.
// Readings requests must use DEXCOM_SHARE_READINGS_HEADERS instead.
export const DEXCOM_SHARE_HEADERS = DEXCOM_SHARE_AUTH_HEADERS;

// The all-zeros UUID — Dexcom returns this when something goes wrong.
export const DEXCOM_SHARE_DEFAULT_UUID = "00000000-0000-0000-0000-000000000000";

// Trend directions returned by the Share API (PascalCase strings).
// These map cleanly to STACKD's existing mapDexcomTrend() function, which
// normalizes any casing variant to snake_case before matching.
export const DEXCOM_SHARE_TREND_DIRECTIONS = {
  None: 0,
  DoubleUp: 1,
  SingleUp: 2,
  FortyFiveUp: 3,
  Flat: 4,
  FortyFiveDown: 5,
  SingleDown: 6,
  DoubleDown: 7,
  NotComputable: 8,
  RateOutOfRange: 9,
};