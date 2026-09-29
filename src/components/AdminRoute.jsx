import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

/**
 * Layout route that only allows admin users through. Non-admins are
 * redirected to the home page. Sits inside the authenticated Layout route
 * so auth is already guaranteed by the time this renders.
 */
export default function AdminRoute() {
  const { user } = useAuth();
  if (!user) return <Navigate to="/" replace />;
  if (user.role !== "admin") return <Navigate to="/" replace />;
  return <Outlet />;
}