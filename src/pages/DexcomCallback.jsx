import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";

export default function DexcomCallback() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("processing");
  const [error, setError] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const errParam = params.get("error");

    if (errParam) {
      setStatus("error");
      setError(params.get("error_description") || errParam);
      return;
    }
    if (!code) {
      setStatus("error");
      setError("We didn't receive a connection code from your glucose source.");
      return;
    }

    (async () => {
      try {
        await base44.functions.invoke("dexcomCallback", { code });
        setStatus("success");
        setTimeout(() => navigate("/settings/dexcom", { replace: true }), 1500);
      } catch (err) {
        setStatus("error");
        setError(err?.message || "We couldn't complete the connection.");
      }
    })();
  }, [navigate]);

  return (
    <div className="mx-auto max-w-md flex min-h-[60vh] flex-col items-center justify-center px-6 text-center">
      {status === "processing" && (
        <>
          <Loader2 className="h-10 w-10 animate-spin text-teal-400" />
          <p className="mt-5 text-sm font-medium text-white">
            Bringing your glucose flow into Stackd…
          </p>
          <p className="mt-1 text-xs text-white/40">Hold tight, this only takes a moment.</p>
        </>
      )}
      {status === "success" && (
        <>
          <CheckCircle2 className="h-12 w-12 text-teal-400" />
          <p className="mt-5 text-sm font-medium text-white">
            You're connected — your readings can flow in peacefully now.
          </p>
        </>
      )}
      {status === "error" && (
        <>
          <AlertCircle className="h-12 w-12 text-rose-400" />
          <p className="mt-5 text-sm font-medium text-white">
            We couldn't finish the connection.
          </p>
          <p className="mt-1 text-xs text-white/40 max-w-xs">{error}</p>
          <button
            type="button"
            onClick={() => navigate("/settings/dexcom", { replace: true })}
            className="mt-6 px-5 py-2.5 rounded-2xl border border-white/10 text-white/70 hover:bg-white/5 hover:text-white text-sm font-medium transition-all"
          >
            Back to Glucose Source
          </button>
        </>
      )}
    </div>
  );
}