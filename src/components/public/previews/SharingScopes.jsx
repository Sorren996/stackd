import { Flag, PreviewCard, SampleTag } from "@/components/public/parts";

const SCOPES = [
  { label: "Glucose readings and today's balance", state: "On", tone: "on" },
  { label: "Insulin doses and estimated active insulin", state: "On", tone: "on" },
  { label: "Last known location", state: "Off", tone: "off" },
  { label: "Urgent low notice by email", state: "Off", tone: "off" },
  { label: "Urgent low notice by text message", state: "Off", tone: "off" },
  { label: "Permission to call me if I need help", state: "Off", tone: "off" },
];

/**
 * The permission list the owner controls, one switch per person. Shown closed
 * by default in the app, and shown here exactly as the owner sees it.
 */
export default function SharingScopes() {
  return (
    <div className="space-y-3">
      <div className="flex justify-center">
        <SampleTag />
      </div>
      <PreviewCard label="What Ana can see" right={<Flag>Only Ana</Flag>}>
        <ul>
          {SCOPES.map((scope) => (
            <li
              key={scope.label}
              className="flex items-center justify-between gap-4 py-2.5"
              style={{ borderTop: "1px solid #f0e6d9" }}
            >
              <span className="text-[12px] leading-snug" style={{ color: "#3f3830" }}>
                {scope.label}
              </span>
              <Flag tone={scope.tone}>{scope.state}</Flag>
            </li>
          ))}
        </ul>
        <p className="pt-3 text-[11px] leading-relaxed" style={{ color: "#6b6153" }}>
          Every switch is yours. Turning one off takes effect immediately, and you can end the whole relationship
          whenever you want.
        </p>
      </PreviewCard>
    </div>
  );
}