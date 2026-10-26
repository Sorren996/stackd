import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight, MapPin, Phone, Settings2 } from "lucide-react";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import SharedGlucoseChart from "@/components/follower/SharedGlucoseChart";
import SharedInsulinSheet from "@/components/follower/SharedInsulinSheet";
import SharedLocationSheet from "@/components/follower/SharedLocationSheet";
import SharedGlucosePanel from "@/components/sharing/SharedGlucosePanel";
import SharedInsulinPanel from "@/components/sharing/SharedInsulinPanel";
import { useAuth } from "@/lib/AuthContext";
import { getSharedView, describeSharingError } from "@/lib/sharing/sharingApi";
import { describeProjectionReason, describeStatus } from "@/lib/sharing/sharingCopy";
import { sharerName } from "@/lib/sharing/sharerName";

/**
 * One followed person's dashboard.
 *
 * Every figure is produced by the server projection for THIS relationship: the
 * window, the day boundary and the target range are all the sharer's, and each
 * scope is read on its own, so a glucose-only permission returns no insulin and
 * no location at all. The query key carries the viewer, the relationship and its
 * permission version, so switching people — or a scope change — can never show
 * the previous person's chart.
 */
export default function SharerDashboard({ relationship, onOpenPrefs }) {
  const { user } = useAuth();
  const [insulinOpen, setInsulinOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);

  const isActive = relationship.status === "active";

  const { data, isLoading, error } = useQuery({
    queryKey: ["shared-view", user?.id || "anon", relationship.id, relationship.permission_version],
    queryFn: () => getSharedView(relationship.id),
    enabled: isActive,
    gcTime: 0,
    // A pause or withdrawal made elsewhere is re-checked the moment the viewer
    // returns to the app, instead of leaving old figures on screen.
    refetchOnWindowFocus: true,
  });

  const label = sharerName(relationship.sharer_display_name);
  const status = describeStatus(relationship.status);
  const scopes = relationship.scopes || {};

  // A refused read (revoked, paused, expired) always wins over any cached copy.
  const blocked = Boolean(error) || !isActive;
  const blockedReason = error ? describeSharingError(error) : describeProjectionReason(relationship.status);

  return (
    <div className="space-y-4">
      <div className="flex items-baseline gap-2 px-1">
        <h1 className="min-w-0 flex-1 truncate text-lg font-semibold" style={{ color: "#fdf9f2" }}>
          {label}
        </h1>
        <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.12em]" style={{ color: "#e7e2d9" }}>
          {status.label}
        </span>
        <button
          type="button"
          onClick={() => onOpenPrefs?.(relationship)}
          className="shrink-0 rounded-lg p-1 transition hover:opacity-70"
          aria-label="Your notice settings"
        >
          <Settings2 className="h-4 w-4" style={{ color: "#fdf9f2" }} />
        </button>
      </div>

      {blocked && (
        <SectionCard label="Not available">
          <p className="text-sm" style={{ color: "#746959" }}>
            {blockedReason}
          </p>
        </SectionCard>
      )}

      {!blocked && isLoading && (
        <SectionCard>
          <div className="space-y-3 py-1">
            <div className="h-8 w-24 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.12)" }} />
            <div className="h-40 w-full animate-pulse rounded-xl" style={{ background: "rgba(116,105,89,0.10)" }} />
          </div>
        </SectionCard>
      )}

      {!blocked && data && (
        <>
          {!scopes.glucose && !scopes.insulin && !scopes.location && (
            <SectionCard label="Nothing shared yet">
              <p className="text-sm" style={{ color: "#746959" }}>
                {label} has not switched anything on for you yet. They can turn on glucose, insulin or their last known
                location at any time, and they can change it whenever they like.
              </p>
            </SectionCard>
          )}

          {scopes.glucose && (
            <SectionCard label="Glucose">
              <SharedGlucosePanel glucose={data.glucose} reason={data.glucose_reason} />
              {data.glucose && (
                <div className="pt-3">
                  <SharedGlucoseChart
                    readings={data.glucose.readings}
                    targetLow={data.glucose.target_low}
                    targetHigh={data.glucose.target_high}
                  />
                  <p className="pt-1 text-[11px]" style={{ color: "#746959" }}>
                    Scroll sideways for the earlier part of the last {data.glucose.window_hours ?? 24} hours.
                  </p>
                </div>
              )}
            </SectionCard>
          )}

          {scopes.insulin && (
            <SectionCard label="Insulin">
              {/* The hero itself opens the active-insulin view: there is no dose
                  history and no dose count on this screen. */}
              <SharedInsulinPanel
                insulin={data.insulin}
                reason={data.insulin_reason}
                onOpenDetail={() => setInsulinOpen(true)}
              />
            </SectionCard>
          )}

          {scopes.location && (
            <SectionCard label="Location">
              <button
                type="button"
                onClick={() => setLocationOpen(true)}
                className="flex w-full items-center gap-2 text-left"
              >
                <MapPin className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />
                <span className="min-w-0 flex-1 text-sm" style={{ color: "#3f3830" }}>
                  {data.location ? "See their last known location" : describeProjectionReason(data.location_reason)}
                </span>
                {data.location && <ChevronRight className="h-4 w-4 shrink-0" style={{ color: "#746959" }} />}
              </button>
            </SectionCard>
          )}

          {data.summary?.contact_available && data.summary?.contact && (
            <SectionCard label="Call">
              <Button asChild className="w-full rounded-full">
                <a href={`tel:${data.summary.contact.tel}`}>
                  <Phone className="mr-2 h-4 w-4" />
                  Call {label}
                </a>
              </Button>
              <p className="pt-2 text-xs" style={{ color: "#746959" }}>
                A person-to-person call. This is not an emergency service.
              </p>
            </SectionCard>
          )}

          {scopes.urgent_low_call && !data.summary?.contact_available && (
            <SectionCard>
              <p className="text-xs" style={{ color: "#746959" }}>
                {label} has not released their number to you.
              </p>
            </SectionCard>
          )}
        </>
      )}

      <SharedInsulinSheet
        open={insulinOpen}
        onClose={() => setInsulinOpen(false)}
        insulin={data?.insulin}
        reason={data?.insulin_reason}
        sharerLabel={label}
      />
      <SharedLocationSheet
        open={locationOpen}
        onClose={() => setLocationOpen(false)}
        location={data?.location}
        reason={data?.location_reason}
        sharerLabel={label}
      />
    </div>
  );
}