import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { DEXCOM_TOKEN_URL } from "../../shared/dexcomConfig.ts";

// Exchanges the authorization code (received at the redirect_uri) for an
// access + refresh token, then stores the connection against the signed-in
// user. The frontend calls this with { code } from the redirect page.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const { code } = body;
    if (!code) {
      return Response.json({ error: 'Missing authorization code' }, { status: 400 });
    }

    const clientId = secrets.get("DEXCOM_CLIENT_ID");
    const clientSecret = secrets.get("DEXCOM_CLIENT_SECRET");
    const redirectUri = secrets.get("DEXCOM_REDIRECT_URI");

    if (!clientId || !clientSecret || !redirectUri) {
      return Response.json({ error: 'Dexcom credentials not configured' }, { status: 500 });
    }

    const tokenResponse = await fetch(DEXCOM_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: code,
        redirect_uri: redirectUri,
        client_id: clientId,
        client_secret: clientSecret
      })
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      return Response.json({ error: 'Dexcom token exchange failed', details: errText }, { status: 502 });
    }

    const tokens = await tokenResponse.json();

    const expiresAt = new Date(Date.now() + (tokens.expires_in || 0) * 1000).toISOString();

    // Replace any prior connection so only the latest token set is kept.
    await base44.entities.DexcomConnection.deleteMany({});
    await base44.entities.DexcomConnection.create({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_type: tokens.token_type || "bearer",
      expires_in: tokens.expires_in,
      expires_at: expiresAt,
      scope: tokens.scope,
      connected_at: new Date().toISOString(),
      status: "connected"
    });

    return Response.json({ status: "connected", expires_at: expiresAt });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}