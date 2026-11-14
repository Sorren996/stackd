import LedgerRow from "@/components/editorial/LedgerRow";
import SectionCard from "@/components/editorial/SectionCard";

const DOT = { ok: "#5b6550", attention: "#a0522d" };

/**
 * The one card on Settings that says where glucose comes from: the CGM's
 * connection, the sensor session's wear time, and the way in to hand logging.
 * Every row keeps the state it had before — same dot, same subtext, same
 * destination — so nothing about the source is claimed outside this card.
 *
 * Until the connection read answers, the Dexcom row is simply not drawn: an
 * unanswered query is not "not connected".
 */
export default function GlucoseSourceCard({ band, connected, modelLabel, sensorNote }) {
  return (
    <SectionCard label="Glucose source">
      {band && (
        <LedgerRow
          label={connected ? band.title : `${modelLabel}, not connected`}
          note={connected ? band.detail : "Link Dexcom to pick your readings up automatically."}
          dot={DOT[band.tone] || DOT.ok}
          to="/settings/dexcom"
        />
      )}
      <LedgerRow label="Sensor session" note={sensorNote} to="/settings/sensor" />
      <LedgerRow label="Log manually" to="/settings/manual-glucose" />
    </SectionCard>
  );
}