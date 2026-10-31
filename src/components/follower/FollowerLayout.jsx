import { useNavigate, Outlet } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import PullToRefresh from "@/components/PullToRefresh";
import FollowerNav from "@/components/follower/FollowerNav";
import HeaderBackdrop from "@/components/header/HeaderBackdrop";

/**
 * The viewer shell.
 *
 * Slate canvas, cream cards, and a bar with no logging action. It never mounts
 * the patient's dashboard, journal or rhythms, and it never routes anyone into
 * patient set-up. The one account-and-privacy notice a viewer genuinely needs is
 * kept here, separate from the patient medical acknowledgments.
 */
export default function FollowerLayout() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const handleRefresh = () =>
    queryClient
      .refetchQueries({
        predicate: (query) => ["shared-view", "access-profile", "shared-with-me"].includes(query.queryKey[0]),
      })
      .catch(() => {});

  return (
    <div className="isolate relative min-h-screen overflow-x-hidden" style={{ background: "#4C6770" }}>
      <header
        className="fixed inset-x-0 top-0 z-50"
        style={{ paddingTop: "env(safe-area-inset-top)", background: "transparent" }}
      >
        {/* Same progressive blur-only effect as the patient header. */}
        <HeaderBackdrop />
        <div className="relative z-10 mx-auto flex h-14 max-w-6xl items-center justify-center px-4">
          <button
            type="button"
            onClick={() => navigate("/")}
            aria-label="Stackd home"
            className="relative flex items-center justify-center rounded-full transition-all"
          >
            <img
              src="https://media.base44.com/images/public/6a1b93f234a8611ee1595134/9cd3c84cf_stackdappiconver3tran.png"
              alt="Stackd"
              className="relative z-10 h-9 w-auto object-contain"
            />
          </button>
        </div>
      </header>

      <main className="relative mx-auto w-full max-w-6xl px-4 overflow-x-hidden" style={{ height: "100dvh" }}>
        <PullToRefresh onRefresh={handleRefresh}>
          <div
            className="min-w-0 w-full"
            style={{
              paddingTop: "calc(3.5rem + env(safe-area-inset-top))",
              // Clearance for the plain pill (68px) plus its own breathing gap.
              paddingBottom: "calc(72px + 32px + env(safe-area-inset-bottom))",
            }}
          >
            <Outlet />
          </div>
        </PullToRefresh>
      </main>

      <FollowerNav />
    </div>
  );
}