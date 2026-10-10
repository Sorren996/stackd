// Guard for all-users batch functions (scheduled workflows).
//
// Scheduled workflows invoke functions under the app owner's admin identity.
// Ordinary authenticated users and anonymous callers are rejected with 403,
// so no user session can trigger cross-user processing — regardless of the
// payload. Batch functions must also ignore any client-supplied user target.

export async function requireBatchCaller(base44: any): Promise<Response | null> {
  const user = await base44.auth.me().catch(() => null);
  if (!user || user.role !== "admin") {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }
  return null;
}