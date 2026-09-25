import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import moment from "moment";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Leaf, Sparkles, Heart, ExternalLink, X, AlertCircle, Hourglass } from "lucide-react";
import { NumberPadField } from "@/components/FormInputFields";
import SectionCard from "@/components/editorial/SectionCard";
import LedgerRow from "@/components/editorial/LedgerRow";

const PRESET_CENTS = [300, 500, 1000];
const MIN_CENTS = 100;
const MAX_CENTS = 250000;

const GIFT_GRADIENT = {
  background: "#8a5a12",
  color: "#f7f1e8",
};
const MONTHLY_GRADIENT = {
  background: "#5b6550",
  color: "#f7f1e8",
};

function formatCents(cents) {
  const n = Number(cents) || 0;
  const dollars = n / 100;
  return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function isEmbedded() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export default function SupportCreator() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("gift");
  const [selectedPreset, setSelectedPreset] = useState(500);
  const [customAmount, setCustomAmount] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [isOpeningPortal, setIsOpeningPortal] = useState(false);
  const [verifyState, setVerifyState] = useState(null);

  const { data: supports = [] } = useQuery({
    queryKey: ["creator-support"],
    queryFn: () => base44.entities.CreatorSupport.list("-created_date", 50),
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sessionId = params.get("session_id");
    if (params.get("support_success") && sessionId) {
      window.history.replaceState({}, "", window.location.pathname);
      setVerifyState({ type: "verifying" });
      base44.functions
        .invoke("verifySupportPayment", { sessionId })
        .then((res) => {
          const data = res.data || {};
          if (data.status === "recorded") {
            setVerifyState({ type: "success", contribution: data.contribution });
            queryClient.invalidateQueries({ queryKey: ["creator-support"] });
          } else if (data.status === "pending") {
            setVerifyState({ type: "pending" });
          } else {
            setVerifyState({ type: "error" });
          }
        })
        .catch(() => setVerifyState({ type: "error" }));
    } else if (params.get("support_canceled")) {
      window.history.replaceState({}, "", window.location.pathname);
      setVerifyState({ type: "canceled" });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isMonthly = tab === "monthly";
  const customCents = Math.round(Number(customAmount) * 100);
  const customValid = Number.isFinite(customCents) && customCents >= MIN_CENTS && customCents <= MAX_CENTS;
  const selectedCents = customAmount.trim() !== "" ? (customValid ? customCents : null) : selectedPreset;
  const canConfirm = !!selectedCents && !isCreating;

  const handleConfirm = async () => {
    if (!selectedCents) return;
    if (isEmbedded()) {
      toast.error("Checkout opens from the published app. Please open Stackd directly to continue.");
      return;
    }
    setIsCreating(true);
    try {
      const res = await base44.functions.invoke("createSupportCheckout", {
        amountCents: selectedCents,
        interval: isMonthly ? "month" : "one_time",
        origin: window.location.origin,
      });
      const url = res.data?.url;
      if (!url) throw new Error("no url");
      window.location.href = url;
    } catch (error) {
      setIsCreating(false);
      toast.error(
        error?.response?.data?.error ||
          "We could not open the checkout window just yet. Please try again in a moment."
      );
    }
  };

  const hasCustomer = supports.some((r) => r.stripe_customer_id);

  const handleManage = async () => {
    if (isEmbedded()) {
      toast.error("The billing portal opens from the published app. Please open Stackd directly to continue.");
      return;
    }
    setIsOpeningPortal(true);
    try {
      const res = await base44.functions.invoke("createSupportPortalSession", { origin: window.location.origin });
      const url = res.data?.url;
      if (!url) throw new Error("no url");
      window.location.href = url;
    } catch (error) {
      setIsOpeningPortal(false);
      toast.error(
        error?.response?.data?.error ||
          "We could not open the billing portal just yet. Please try again in a moment."
      );
    }
  };

  const selectPreset = (cents) => {
    setSelectedPreset(cents);
    setCustomAmount("");
  };

  return (
    <div className="space-y-5">
      <AnimatePresence>
        {verifyState && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.25 }}
          >
            <VerifyPanel state={verifyState} onClose={() => setVerifyState(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      <SectionCard>
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: "rgba(91,101,80,0.25)", background: "rgba(91,101,80,0.08)" }}>
            <Leaf className="h-5 w-5" style={{ color: "#5b6550" }} />
          </div>
          <div>
            <p className="text-sm leading-relaxed" style={{ color: "#6b6153" }}>
              Stackd is made with care, one leaf at a time. If it brings you a little calm, you can send a little sunshine back, a one-time gift or ongoing monthly patronage. Always optional, always appreciated.
            </p>
          </div>
        </div>
      </SectionCard>

      {/* Tabs */}
      <div className="rounded-2xl border p-1" style={{ borderColor: "#eadccf", background: "#f7f1e8" }}>
        <div className="flex">
          {[
            { id: "gift", label: "One-time gift", Icon: Sparkles },
            { id: "monthly", label: "Monthly patron", Icon: Heart },
          ].map(({ id, label, Icon }) => {
            const active = tab === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all"
                style={active ? { background: "#3f3830", color: "#f7f1e8" } : { color: "#6b6153" }}
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Presets */}
      <SectionCard label={isMonthly ? "Choose your monthly patronage" : "Choose a gift amount"}>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_CENTS.map((cents) => {
            const active = !customAmount && selectedPreset === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => selectPreset(cents)}
                className="rounded-2xl border px-3 py-4 text-center transition-all"
                style={active
                  ? { borderColor: "rgba(91,101,80,0.50)", background: "rgba(91,101,80,0.12)" }
                  : { borderColor: "#eadccf", background: "#fdf9f2" }
                }
              >
                <span className="block text-lg font-bold" style={{ color: "#3f3830" }}>{formatCents(cents)}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider" style={{ color: "#746959" }}>
                  {isMonthly ? "/ month" : "gift"}
                </span>
              </button>
            );
          })}
        </div>
      </SectionCard>

      {/* Custom amount */}
      <SectionCard label="Or a custom amount">
        <NumberPadField
          label={isMonthly ? "Custom monthly amount" : "Custom gift amount"}
          value={customAmount}
          onChange={(v) => setCustomAmount(v)}
          unit="$"
          placeholder="0"
          maxLength={6}
        />
        {customAmount.trim() !== "" && !customValid && (
          <p className="mt-1.5 px-1 text-[11px]" style={{ color: "#c97060" }}>Please enter an amount between $1 and $2,500.</p>
        )}
      </SectionCard>

      {/* Confirm */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold transition disabled:opacity-40"
        style={isMonthly ? MONTHLY_GRADIENT : GIFT_GRADIENT}
      >
        {isCreating ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Opening checkout...
          </>
        ) : (
          <>
            {isMonthly ? <Heart className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
            {selectedCents ? `${isMonthly ? "Give " : "Give "}${formatCents(selectedCents)}${isMonthly ? " / month" : ""}` : "Choose an amount"}
          </>
        )}
      </button>

      <SectionCard>
        <p className="text-center text-[11px] leading-relaxed" style={{ color: "#746959" }}>
          Payments are handled securely by Stripe. You can manage or cancel monthly patronage anytime.
        </p>
      </SectionCard>

      {/* Manage monthly support */}
      {hasCustomer && (
        <SectionCard label="Managing your support">
          <div className="space-y-3">
            <p className="text-xs leading-relaxed" style={{ color: "#6b6153" }}>
              Update your card, view invoices, or cancel a monthly patronage through Stripe's secure billing portal.
            </p>
            <button
              type="button"
              onClick={handleManage}
              disabled={isOpeningPortal}
              className="flex w-full items-center justify-center gap-2 rounded-xl border py-3 text-sm font-semibold transition disabled:opacity-50"
              style={{ borderColor: "rgba(91,101,80,0.30)", background: "rgba(91,101,80,0.08)", color: "#5b6550" }}
            >
              {isOpeningPortal ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Opening portal...
                </>
              ) : (
                <>
                  <ExternalLink className="h-4 w-4" />
                  Open billing portal
                </>
              )}
            </button>
          </div>
        </SectionCard>
      )}

      {/* History */}
      {supports.length > 0 && (
        <SectionCard label="Your kindness">
          <div>
            {supports.map((record) => (
              <LedgerRow
                key={record.id}
                label={formatCents(record.amount_cents)}
                value={record.support_type === "monthly" ? "monthly" : "gift"}
                timestamp={moment(record.created_date).format("MMM D, YYYY")}
              />
            ))}
          </div>
        </SectionCard>
      )}
    </div>
  );
}

function VerifyPanel({ state, onClose }) {
  const { type, contribution } = state;

  const config = {
    verifying: {
      Icon: Loader2,
      iconClass: "animate-spin",
      title: "Confirming your gift...",
      iconColor: "#5b6550",
      body: "Just a moment while we settle your kindness into the canopy.",
      showClose: false,
    },
    success: {
      Icon: Leaf,
      iconClass: "",
      title: "Thank you for nurturing Stackd",
      iconColor: "#5b6550",
      body:
        contribution
          ? `Your ${contribution.support_type === "monthly" ? "monthly patronage" : "gift"} of ${formatCents(
              contribution.amount_cents
            )} helps this little forest keep growing. Every leaf counts.`
          : "Your gift helps this little forest keep growing. Every leaf counts.",
      showClose: true,
    },
    pending: {
      Icon: Hourglass,
      iconClass: "",
      title: "Your gift is still settling",
      iconColor: "#af751b",
      body: "It can take a moment for a payment to fully land. Check back shortly. Your kindness will show up here once it does.",
      showClose: true,
    },
    canceled: {
      Icon: AlertCircle,
      iconClass: "",
      title: "No rush at all",
      iconColor: "#8a7f70",
      body: "Your presence here is enough. You can send a little sunshine back whenever it feels right.",
      showClose: true,
    },
    error: {
      Icon: AlertCircle,
      iconClass: "",
      title: "We could not confirm just yet",
      iconColor: "#c97060",
      body: "Something did not go as expected confirming your support. Please try again in a moment.",
      showClose: true,
    },
  }[type] || {};

  const { Icon, iconClass, title, body, showClose, iconColor } = config;

  return (
    <div className="relative overflow-hidden rounded-2xl border p-5" style={{ background: "#fdf9f2", borderColor: "#eadccf" }}>
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full blur-3xl" style={{ background: "rgba(91,101,80,0.10)" }} />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border" style={{ borderColor: "rgba(91,101,80,0.25)", background: "rgba(91,101,80,0.08)" }}>
          {Icon && <Icon className={`h-5 w-5 ${iconClass}`} style={{ color: iconColor }} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold" style={{ color: "#3f3830" }}>{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed" style={{ color: "#6b6153" }}>{body}</p>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 transition"
            style={{ color: "#746959" }}
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}