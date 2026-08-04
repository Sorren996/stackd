import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { secrets } from 'base44:runtime';
import { DEXCOM_SANDBOX_AUTH_URL, DEXCOM_DEFAULT_SCOPE } from "../../shared/dexcomConfig.ts";

// Builds the Dexcom sandbox authorization URL. The frontend redirects the
// user here so they can approve Stackd; Dexcom then sends them back to the
// registered redirect_uri with an authorization code.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const clientId = secrets.get("DEXCOM_CLIENT_ID");
    const redirectUri = secrets.get("DEXCOM_REDIRECT_URI");

    if (!clientId || !redirectUri) {
      return Response.json({ error: 'Dexcom credentials not configured' }, { status: 500 });
    }

    const state = crypto.randomUUID();

    const params = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      redirect_uri: redirectUri,
      state: state,
      scope: DEXCOM_DEFAULT_SCOPE
    });

    return Response.json({ authUrl: `${DEXCOM_SANDBOX_AUTH_URL}?${params.toString()}`, state });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}