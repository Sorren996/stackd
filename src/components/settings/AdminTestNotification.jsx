import { useState } from "react";
import { Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { playNotificationFeedback } from "@/lib/notificationFeedback";

/**
 * Admin-only push delivery test. Manual only: nothing runs on mount or on
 * visit, there are no retries, and the button is disabled while a request is
 * pending. The API accepting the send is reported as "submitted" — never as
 * delivered or received.
 */
export default function AdminTestNotification() {
  const [pending, setPending] = useState(false);

  const sendTest = async () => {
    if (pending) return;
    setPending(true);
    try {
      await base44.functions.invoke("sendMyTestPushNotification", {});
      playNotificationFeedback();
      toast.success("Test notification sent. You should hear a chime and feel a buzz here.");
    } catch (error) {
      const message = error?.response?.data?.error || error?.message;
      toast.error(message || "We could not submit the test notification. Please try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <div>
      <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: "#746959" }}>
        Test notifications
      </p>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#6b6153" }}>
        Sends a test to this account’s registered mobile devices. To test your lock screen, open
        Stackd on your computer and lock your phone first.
      </p>
      <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "#746959" }}>
        Sending also plays a chime and a buzz on the device you send from, as a quick confirmation.
      </p>
      <button
        type="button"
        onClick={sendTest}
        disabled={pending}
        className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-semibold transition disabled:opacity-60 stackd-btn-primary"
      >
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        Send me a test notification
      </button>
    </div>
  );
}