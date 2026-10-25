import { useQuery } from "@tanstack/react-query";
import { Phone, Settings2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import SharedGlucosePanel from "@/components/sharing/SharedGlucosePanel";
import SharedInsulinPanel from "@/components/sharing/SharedInsulinPanel";
import SectionCard from "@/components/editorial/SectionCard";
import { getSharedView, describeSharingError } from "@/lib/sharing/sharingApi";
import { describeProjectionReason, describeStatus, describeLocationAge } from "@/lib/sharing/sharingCopy";

/**
 * One person the follower follows.
 *
 * Data is fetched through the server projection, which re-checks the
 * relationship on every read and only ever returns what an enabled scope
 * covers. A paused or withdrawn relationship is not fetched at all.
 */
export default function FollowedPersonCard({ relationship, onOpenPrefs }) {
  const isActive = relationship.status === "active";

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-view", relationship.id, relationship.permission_version],
    queryFn: () => getSharedView(relationship.id),
    enabled: isActive,
    // Revoking must not leave a stale copy on screen: a refetch that returns
    // 403 clears the cache entry rather than serving the old payload.
    gcTime: 0,
  });

  const status = describeStatus(relationship.status);
  const name = relationship.sharer_display_name || "Someone you follow";

  return (
    <SectionCard className="space-y-3">
      <div className="flex items-baseline gap-2">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold" style={{ color: "#3f3830" }}>
          {name}
        </h2>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#746959" }}>
          {status.label}
        </span>
        <button
          type="button"
          onClick={() => onOpenPrefs?.(relationship)}
          className="shrink-0 rounded-lg p-1 transition hover:opacity-70"
          aria-label="Your notice settings"
        >
          <Settings2 className="h-4 w-4" style={{ color: "#746959" }} />
        </button>
      </div>

      {!isActive && (
        <p className="text-sm" style={{ color: "#746959" }}>
          {describeProjectionReason(relationship.status)}
        </p>
      )}

      {isActive && isLoading && (
        <div className="space-y-2 py-2">
          <div className="h-4 w-24 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.12)" }} />
          <div className="h-3 w-40 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.10)" }} />
        </div>
      )}

      {isActive && error && (
        <p className="text-sm" style={{ color: "#746959" }}>
          {describeSharingError(error)}
        </p>
      )}

      {isActive && data && (
        <div className="space-y-4">
          {relationship.scopes?.glucose && (
            <SharedGlucosePanel glucose={data.glucose} reason={data.glucose_reason} />
          )}

          {relationship.scopes?.insulin && (
            <div className="border-t pt-3" style={{ borderColor: "#eadccf" }}>
              <SharedInsulinPanel insulin={data.insulin} reason={data.insulin_reason} />
            </div>
          )}

          {relationship.scopes?.location && (
            <div className="flex items-center gap-2 border-t pt-3" style={{ borderColor: "#eadccf" }}>
              <MapPin className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />
              <span className="min-w-0 flex-1 text-sm" style={{ color: "#3f3830" }}>
                {data.location
                  ? "Latest location shared"
                  : describeProjectionReason(data.location_reason)}
              </span>
              {data.location && (
                <a
                  className="shrink-0 text-xs font-semibold uppercase tracking-wider"
                  style={{ color: "#5b6550" }}
                  href={`https://www.google.com/maps?q=${data.location.latitude},${data.location.longitude}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open map
                </a>
              )}
            </div>
          )}

          {data.location && (
            <p className="text-xs" style={{ color: "#746959" }}>
              {describeLocationAge(data.location.age_minutes)}
            </p>
          )}

          {data.summary?.contact_available && data.summary?.contact && (
            <div className="border-t pt-3">
              <Button asChild className="w-full rounded-full">
                <a href={`tel:${data.summary.contact.tel}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call {name}
                </a>
              </Button>
              <p className="pt-2 text-xs" style={{ color: "#746959" }}>
                For a person-to-person call. This is not an emergency service.
              </p>
            </div>
          )}

          {relationship.scopes?.urgent_low_call && !data.summary?.contact_available && (
            <p className="border-t pt-3 text-xs" style={{ color: "#746959" }}>
              They have not released their number to you.
            </p>
          )}
        </div>
      )}
    </SectionCard>
  );
}