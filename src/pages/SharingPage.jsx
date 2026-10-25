import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { UserPlus, ShieldAlert } from "lucide-react";
import SettingsSubPage from "@/components/settings/SettingsSubPage";
import SectionCard from "@/components/editorial/SectionCard";
import { Button } from "@/components/ui/button";
import RelationshipRow from "@/components/sharing/RelationshipRow";
import RelationshipSheet from "@/components/sharing/RelationshipSheet";
import ShareInviteSheet from "@/components/sharing/ShareInviteSheet";
import ContactNumberCard from "@/components/sharing/ContactNumberCard";
import LocationPublishCard from "@/components/sharing/LocationPublishCard";
import { getSharingRelationships } from "@/lib/sharing/sharingApi";
import { summaryLine } from "@/lib/sharing/sharingCopy";

/**
 * The owner's sharing dashboard: who follows them, what each person can see,
 * their own contact number, and their latest location.
 */
export default function SharingPage() {
  const [inviteOpen, setInviteOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["sharing-relationships"],
    queryFn: getSharingRelationships,
  });

  const relationships = data?.relationships || [];
  const selected = relationships.find((r) => r.id === selectedId) || null;
  const missingSecrets = data?.missing_secrets || [];

  const subtitleFor = (relationship) => {
    if (relationship.status === "pending") {
      const invite = relationship.invitation;
      if (invite?.delivery_status === "sent") return "Invitation emailed. Waiting for them to accept.";
      if (invite?.delivery_status === "not_configured") return "Invitation ready to share — the email could not be sent.";
      return "Waiting for them to accept.";
    }
    return summaryLine(relationship.scopes);
  };

  return (
    <SettingsSubPage title="Sharing" italicWord="with others">
      {missingSecrets.length > 0 && (
        <SectionCard label="Setup needed">
          <div className="flex gap-3">
            <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "#8a6326" }} />
            <p className="text-sm" style={{ color: "#746959" }}>
              Sharing stays switched off until this app&apos;s encryption keys are saved in Secrets. Nothing can be
              stored or sent until then.
            </p>
          </div>
        </SectionCard>
      )}

      <SectionCard label="People who follow you">
        {isLoading ? (
          <div className="space-y-3 py-2">
            <div className="h-4 w-40 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.12)" }} />
            <div className="h-4 w-32 animate-pulse rounded" style={{ background: "rgba(116,105,89,0.10)" }} />
          </div>
        ) : relationships.length === 0 ? (
          <p className="pb-3 text-sm" style={{ color: "#746959" }}>
            Nobody follows you yet. An invitation is a personal link — nothing is shared until they accept and you
            switch something on for them.
          </p>
        ) : (
          <div className="divide-y" style={{ borderColor: "#eadccf" }}>
            {relationships.map((relationship) => (
              <RelationshipRow
                key={relationship.id}
                title={relationship.invited_email}
                subtitle={subtitleFor(relationship)}
                status={relationship.status}
                onOpen={() => setSelectedId(relationship.id)}
              />
            ))}
          </div>
        )}

        <Button className="mt-4 w-full rounded-full" onClick={() => setInviteOpen(true)}>
          <UserPlus className="mr-2 h-4 w-4" />
          Invite someone
        </Button>
      </SectionCard>

      <SectionCard label="Your contact number">
        <ContactNumberCard contact={data?.contact} onSaved={refetch} />
      </SectionCard>

      <SectionCard label="Your latest location">
        <LocationPublishCard location={data?.location} onPublished={refetch} />
      </SectionCard>

      <SectionCard label="Notices">
        <p className="text-sm" style={{ color: "#746959" }}>
          An urgent low notice is only sent for a fresh reading, and only to the people you have switched it on for.
          A stale or filled-in reading never triggers one.
        </p>
        {data?.alert_summary?.total > 0 && (
          <p className="pt-2 text-xs" style={{ color: "#746959" }}>
            {data.alert_summary.sent} notice(s) sent
            {data.alert_summary.not_configured > 0 &&
              ` · ${data.alert_summary.not_configured} could not be sent because no text-message provider is connected`}
            {data.alert_summary.failed > 0 && ` · ${data.alert_summary.failed} failed`}
          </p>
        )}
      </SectionCard>

      <ShareInviteSheet
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        onInvited={refetch}
        displayName={undefined}
      />

      <RelationshipSheet
        relationship={selected}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        onChanged={refetch}
      />
    </SettingsSubPage>
  );
}