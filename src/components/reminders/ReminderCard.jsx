import { CONTROL } from "@/lib/notifications/notificationFieldTheme";

/**
 * The one card on the Reminders page: cream fill, a hairline edge and a 16px
 * radius. It owns no state.
 */
export default function ReminderCard({ title, children }) {
  return (
    <section
      className="px-[18px] py-4"
      style={{
        background: CONTROL.fill,
        border: `1px solid ${CONTROL.hairline}`,
        borderRadius: 16,
      }}
    >
      {title && (
        <h2 className="pb-1 text-sm font-semibold" style={{ color: CONTROL.ink, borderBottom: "none" }}>
          {title}
        </h2>
      )}
      {children}
    </section>
  );
}