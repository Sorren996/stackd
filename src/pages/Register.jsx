import React, { useReducer, useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UserPlus, Mail, Lock, Loader2 } from "lucide-react";
import CodeInput from "@/components/auth/CodeInput";
import { canSubmit, initialOtpState, otpReducer } from "@/lib/verification/otpState";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";
import { toast } from "@/components/ui/use-toast";
import { safeReturnTo } from "@/lib/authReturnTo";

// How long a freshly emailed code stays usable, per the platform's own policy.
const CODE_VALIDITY_MINUTES = 10;

export default function Register() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showOtp, setShowOtp] = useState(false);
  const [otp, dispatchOtp] = useReducer(otpReducer, initialOtpState);

  const cleanEmail = email.trim().toLowerCase();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    setEmail(cleanEmail);
    setLoading(true);
    try {
      await base44.auth.register({ email: cleanEmail, password });
      setShowOtp(true);
    } catch (err) {
      const msg = String(err?.message || "").toLowerCase();
      if (msg.includes("exist") || msg.includes("already") || msg.includes("registered") || msg.includes("taken")) {
        // An account already exists for this email. If it's still unverified,
        // resend the OTP so the person can finish verifying it; otherwise send
        // them to log in.
        try {
          await base44.auth.resendOtp(cleanEmail);
          dispatchOtp({ type: "resent" });
          setShowOtp(true);
          toast({
            title: "Let's pick up where you left off",
            description: `We sent a fresh code to finish setting up your account. It works for ${CODE_VALIDITY_MINUTES} minutes.`,
          });
        } catch {
          const params = new URLSearchParams({ existing: "1" });
          params.set("email", cleanEmail);
          window.location.href = `/login?${params.toString()}`;
        }
        return;
      }
      setError(err.message || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!canSubmit(otp)) return;
    dispatchOtp({ type: "submit" });
    try {
      // verifyOtp returns an access token for the account it just verified; the
      // session is started from that token rather than by signing in again.
      const response = await base44.auth.verifyOtp({ email: cleanEmail, otpCode: otp.code });
      const token = response?.data?.access_token || response?.access_token;
      if (!token) throw new Error("We could not finish signing you in. Please log in.");
      localStorage.setItem("stackd_auth_provider", "email");
      base44.auth.setToken(token);
      dispatchOtp({ type: "verified" });
      // Carries an MCP OAuth request (?returnTo=) through sign-up to consent.
      window.location.href = safeReturnTo();
    } catch (err) {
      dispatchOtp({ type: "failed", message: err?.message });
    }
  };

  const handleResend = async () => {
    if (otp.sendingResend) return;
    dispatchOtp({ type: "resend-start" });
    try {
      await base44.auth.resendOtp(cleanEmail);
      // Clears the spent code and any old complaint, and never leaves the field
      // locked: the person types the newest code straight away.
      dispatchOtp({ type: "resent" });
      toast({
        title: "New code sent",
        description: `The newest code is the one to use. It works for ${CODE_VALIDITY_MINUTES} minutes.`,
      });
    } catch (err) {
      dispatchOtp({ type: "resend-failed", message: err?.message });
    }
  };

  const handleGoogle = () => {
    localStorage.setItem("stackd_auth_provider", "google");
    base44.auth.loginWithProvider("google", safeReturnTo());
  };

  const handleApple = () => {
    localStorage.setItem("stackd_auth_provider", "apple");
    base44.auth.loginWithProvider("apple", safeReturnTo());
  };

  if (showOtp) {
    return (
      <AuthLayout
        icon={Mail}
        title="Verify your email"
        subtitle={`We sent a code to ${email}`}>

        {otp.error &&
          <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm" role="alert">
            {otp.error}
          </div>
        }
        <div className="flex justify-center mb-2">
          <CodeInput
            value={otp.code}
            onChange={(value) => dispatchOtp({ type: "edit", value })}
            invalid={Boolean(otp.error)}
            autoFocus
            label="Six digit verification code"
          />
        </div>
        <p className="mb-4 text-center text-xs leading-relaxed" style={{ color: "#6b6153" }}>
          Tap the boxes and enter all six digits. The code works for {CODE_VALIDITY_MINUTES} minutes.
        </p>
        <Button
          className="w-full h-12 font-medium"
          onClick={handleVerify}
          style={{ background: "#3f3830", color: "#f7f1e8" }}
          disabled={!canSubmit(otp)}>

          {otp.sending ?
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Verifying...
            </> :

            "Verify"
          }
        </Button>
        <p className="text-center text-sm text-muted-foreground mt-4">
          Didn't receive the code?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={otp.sendingResend}
            className="text-primary font-medium hover:underline disabled:opacity-60">
            {otp.sendingResend ? "Sending..." : "Resend"}
          </button>
        </p>
      </AuthLayout>);

  }

  return (
    <AuthLayout
      icon={UserPlus}
      title="Create your account"
      subtitle="Sign up to get started"
      footer={
        <>
          Already have an account?{" "}
          <Link to="/login" className="text-primary font-medium hover:underline">
            Log in
          </Link>
        </>}>

      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleApple}
        style={{ background: "var(--auth-card)", color: "var(--auth-ink)", borderColor: "var(--auth-control-border)" }}>

        <AppleIcon className="w-5 h-5 mr-2" />
        Continue with Apple
      </Button>

      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
        style={{ background: "var(--auth-card)", color: "var(--auth-ink)", borderColor: "var(--auth-control-border)" }}>

        <GoogleIcon className="w-5 h-5 mr-2" />
        Continue with Google
      </Button>

      <div className="relative mb-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-border" />
        </div>
        <div className="relative flex justify-center text-sm uppercase">
          <span className="bg-card px-3 text-muted-foreground">or</span>
        </div>
      </div>

      {error &&
        <div className="mb-4 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          {error}
        </div>
      }

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="space-y-2 text-foreground">
          <Label htmlFor="email">Email</Label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="email"
              type="email"
              autoComplete="email"
              autoFocus
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="pl-10 h-12"
              required />

          </div>
        </div>
        <div className="space-y-2 text-foreground">
          <Label htmlFor="password">Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required />

          </div>
        </div>
        <div className="space-y-2 text-foreground">
          <Label htmlFor="confirm">Confirm Password</Label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              placeholder="••••••••"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="pl-10 h-12"
              required />

          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading} style={{ background: "#3f3830", color: "#f7f1e8" }}>
          {loading ?
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Creating account...
            </> :

            "Create account"
          }
        </Button>
      </form>
    </AuthLayout>);

}