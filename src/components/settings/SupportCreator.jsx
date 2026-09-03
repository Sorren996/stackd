import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import moment from "moment";
import { motion, AnimatePresence } from "framer-motion";
import { Loader2, Leaf, Sparkles, Heart, ExternalLink, X, AlertCircle, Hourglass } from "lucide-react";
import { NumberPadField } from "@/components/FormInputFields";

const PRESET_CENTS = [300, 500, 1000];
const MIN_CENTS = 100;
const MAX_CENTS = 250000;

const GIFT_GRADIENT = {
  background: "linear-gradient(145deg, rgba(217,119,6,0.92), rgba(180,83,9,0.86))",
  boxShadow: "0 8px 24px rgba(217,119,6,0.28), inset 0 1px 1px rgba(255,255,255,0.22)",
};
const MONTHLY_GRADIENT = {
  background: "linear-gradient(145deg, rgba(20,184,166,0.92), rgba(15,118,110,0.86))",
  boxShadow: "0 8px 24px rgba(20,184,166,0.32), inset 0 1px 1px rgba(255,255,255,0.22)",
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

      {/* Intro */}
      <div className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 backdrop-blur-sm">
        <div aria-hidden className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-teal-500/10 blur-2xl" />
        <div className="relative flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-500/10">
            <Leaf className="h-5 w-5 text-teal-300" />
          </div>
          <div>
            <h2 className="text-base font-bold text-white">Support the Creator</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-white/55">
              Stackd is made with care, one leaf at a time. If it brings you a little calm, you can send a little
              sunshine back — a one-time gift or ongoing monthly patronage. Always optional, always appreciated.
            </p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-1" style={{ boxShadow: "inset 0 1px 1px rgba(255,255,255,0.06)" }}>
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
                className={`flex flex-1 items-center justify-center gap-2 rounded-xl py-2.5 text-sm font-medium transition-all ${
                  active ? "text-white" : "text-white/40 hover:text-white/60"
                }`}
                style={
                  active
                    ? {
                        background: "linear-gradient(145deg, rgba(255,255,255,0.1), rgba(255,255,255,0.04))",
                        boxShadow: "inset 0 1px 1px rgba(255,255,255,0.12), 0 2px 8px rgba(0,0,0,0.15)",
                      }
                    : undefined
                }
              >
                <Icon className="h-3.5 w-3.5" />
                {label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Presets */}
      <div>
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
          {isMonthly ? "Choose your monthly patronage" : "Choose a gift amount"}
        </p>
        <div className="grid grid-cols-3 gap-2">
          {PRESET_CENTS.map((cents) => {
            const active = !customAmount && selectedPreset === cents;
            return (
              <button
                key={cents}
                type="button"
                onClick={() => selectPreset(cents)}
                className={`rounded-2xl border px-3 py-4 text-center transition-all ${
                  active
                    ? "border-teal-400/70 bg-teal-500/15"
                    : "border-white/[0.08] bg-white/[0.02] hover:border-white/20"
                }`}
                style={active ? { boxShadow: "inset 0 0 0 1px rgba(45,212,191,0.35), 0 0 16px rgba(20,184,166,0.18)" } : undefined}
              >
                <span className="block text-lg font-bold text-white">{formatCents(cents)}</span>
                <span className="mt-0.5 block text-[10px] uppercase tracking-wider text-white/40">
                  {isMonthly ? "/ month" : "gift"}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Custom amount */}
      <div>
        <p className="mb-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">Or a custom amount</p>
        <NumberPadField
          label={isMonthly ? "Custom monthly amount" : "Custom gift amount"}
          value={customAmount}
          onChange={(v) => setCustomAmount(v)}
          unit="$"
          placeholder="0"
          maxLength={6}
        />
        {customAmount.trim() !== "" && !customValid && (
          <p className="mt-1.5 px-1 text-[11px] text-rose-300/80">Please enter an amount between $1 and $2,500.</p>
        )}
      </div>

      {/* Confirm */}
      <button
        type="button"
        onClick={handleConfirm}
        disabled={!canConfirm}
        className="flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-base font-semibold text-white transition disabled:opacity-40"
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

      <p className="px-1 text-center text-[11px] leading-relaxed text-white/35">
        Payments are handled securely by Stripe. You can manage or cancel monthly patronage anytime.
      </p>

      {/* Manage monthly support */}
      {hasCustomer && (
        <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 backdrop-blur-sm">
          <div className="flex items-center gap-2">
            <Heart className="h-4 w-4 text-teal-300" />
            <p className="text-sm font-semibold text-white">Managing your support</p>
          </div>
          <p className="mt-1 text-[12px] leading-relaxed text-white/50">
            Update your card, view invoices, or cancel a monthly patronage through Stripe's secure billing portal.
          </p>
          <button
            type="button"
            onClick={handleManage}
            disabled={isOpeningPortal}
            className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-teal-400/30 bg-teal-500/10 py-3 text-sm font-semibold text-teal-100 transition hover:bg-teal-500/15 disabled:opacity-50"
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
      )}

      {/* History */}
      {supports.length > 0 && (
        <div>
          <p className="mb-2 flex items-center gap-2 px-1 text-[10px] font-bold uppercase tracking-[0.18em] text-white/35">
            <Leaf className="h-3 w-3" />
            Your kindness
          </p>
          <div className="overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm">
            {supports.map((record, index) => (
              <div
                key={record.id}
                className={`flex items-center justify-between px-4 py-3 ${
                  index !== supports.length - 1 ? "border-b border-white/[0.05]" : ""
                }`}
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-white/85">
                    {formatCents(record.amount_cents)}{" "}
                    {record.support_type === "monthly" ? "monthly patronage" : "gift"}
                  </p>
                  <p className="mt-0.5 text-[11px] text-white/40">
                    {moment(record.created_date).format("MMM D, YYYY")}
                    {record.support_type === "monthly" && record.status === "active" ? " · active" : ""}
                  </p>
                </div>
                <Leaf className="h-4 w-4 shrink-0 text-teal-400/50" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function VerifyPanel({ state, onClose }) {
  const { type, contribution } = state;

  const config = {
    verifying: {
      Icon: Loader2,
      iconClass: "animate-spin text-teal-300",
      title: "Confirming your gift...",
      body: "Just a moment while we settle your kindness into the canopy.",
      showClose: false,
    },
    success: {
      Icon: Leaf,
      iconClass: "text-teal-300",
      title: "Thank you for nurturing Stackd",
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
      iconClass: "text-amber-300",
      title: "Your gift is still settling",
      body: "It can take a moment for a payment to fully land. Check back shortly — your kindness will show up here once it does.",
      showClose: true,
    },
    canceled: {
      Icon: AlertCircle,
      iconClass: "text-white/50",
      title: "No rush at all",
      body: "Your presence here is enough. You can send a little sunshine back whenever it feels right.",
      showClose: true,
    },
    error: {
      Icon: AlertCircle,
      iconClass: "text-rose-300",
      title: "We could not confirm just yet",
      body: "Something did not go as expected confirming your support. Please try again in a moment.",
      showClose: true,
    },
  }[type] || {};

  const { Icon, iconClass, title, body, showClose } = config;

  return (
    <div className="relative overflow-hidden rounded-2xl border border-teal-400/20 bg-white/[0.04] p-5 backdrop-blur-sm">
      <div aria-hidden className="pointer-events-none absolute -right-8 -top-10 h-32 w-32 rounded-full bg-teal-500/15 blur-3xl" />
      <div className="relative flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-teal-400/25 bg-teal-500/10">
          {Icon && <Icon className={`h-5 w-5 ${iconClass}`} />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-white">{title}</p>
          <p className="mt-1 text-[13px] leading-relaxed text-white/55">{body}</p>
        </div>
        {showClose && (
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-1 text-white/40 transition hover:text-white/70"
            aria-label="Dismiss"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}