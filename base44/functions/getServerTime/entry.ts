// The server's own clock, for labels that must not depend on the phone.
//
// A device whose clock is off by a minute turns "now" into "1 min ago" and a
// forecast point into a phantom past reading. Every freshness check and age
// label therefore asks the server what time it is, and the client only falls
// back to the device clock when the two agree to within a minute.

import { createClientFromRequest } from "npm:@base44/sdk@0.8.54";

export default async function (req: Request): Promise<Response> {
  try {
    const base44 = createClientFromRequest(req);

    const user = await base44.auth
      .me()
      .catch((e) => (e.status === 401 ? null : Promise.reject(e)));
    if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

    return Response.json(
      { server_now: new Date().toISOString(), server_now_ms: Date.now() },
      { headers: { "Cache-Control": "no-store" } }
    );
  } catch (error) {
    return Response.json({ error: error?.message || "Time unavailable" }, { status: 500 });
  }
}