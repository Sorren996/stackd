import React, { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { appParams } from "@/lib/app-params";
import { safeReturnTo } from "@/lib/authReturnTo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LogIn, Mail, Lock, Loader2 } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import GoogleIcon from "@/components/GoogleIcon";
import AppleIcon from "@/components/AppleIcon";

export default function Login() {
  const [searchParams] = useSearchParams();
  const isExisting = searchParams.get("existing") === "1";
  const prefilledEmail = searchParams.get("email") || "";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (prefilledEmail) setEmail(prefilledEmail);
  }, [prefilledEmail]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const cleanEmail = email.trim().toLowerCase();
    try {
      // Use a raw fetch to the same login endpoint instead of
      // base44.auth.loginViaEmailPassword. The SDK's implementation calls
      // logout() on a 401, which sets window.location.href to the server
      // logout URL — that reloads the page and silently swallows the error,
      // leaving the user with no feedback. A direct call lets us surface
      // the error inline and keep the user on the login page.
      localStorage.setItem("stackd_auth_provider", "email");
      const response = await fetch(`/api/apps/${appParams.appId}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: cleanEmail, password }),
      });
      if (!response.ok) {
        let message = response.status === 401
          ? "Invalid email or password"
          : "Login failed. Please try again.";
        try {
          const errorData = await response.json();
          if (errorData?.detail) message = errorData.detail;
          else if (errorData?.message) message = errorData.message;
        } catch { /* response body wasn't JSON — use default message */ }
        setError(message);
        return;
      }
      const data = await response.json();
      if (data.access_token) {
        base44.auth.setToken(data.access_token);
      }
      window.location.href = safeReturnTo();
    } catch (err) {
      setError(err.message || "Unable to connect. Please check your network and try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = () => {
    localStorage.setItem("stackd_auth_provider", "google");
    base44.auth.loginWithProvider("google", "/");
  };

  const handleApple = () => {
    localStorage.setItem("stackd_auth_provider", "apple");
    base44.auth.loginWithProvider("apple", "/");
  };

  return (
    <AuthLayout
      icon={LogIn}
      title="Welcome back"
      subtitle="Log in to your account"
      footer={
      <>
          Don't have an account?{" "}
          <Link to="/register" className="text-primary font-medium hover:underline">
            Create one
          </Link>
        </>
      }>
      
      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-3"
        onClick={handleApple}
        style={{ background: "#fdf9f2", color: "#3f3830", borderColor: "#eadccf" }}>
        
        <AppleIcon className="w-5 h-5 mr-2" />
        Continue with Apple
      </Button>

      <Button
        variant="outline"
        className="w-full h-12 text-sm font-medium mb-6"
        onClick={handleGoogle}
        style={{ background: "#fdf9f2", color: "#3f3830", borderColor: "#eadccf" }}>
        
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

      {isExisting &&
      <div className="mb-4 rounded-2xl border p-4 text-sm leading-relaxed" style={{ borderColor: "#eadccf", background: "#fdf9f2" }}>
          <p className="font-semibold">It looks like you already have an account.</p>
          <p className="mt-1 text-xs text-muted-foreground">Log in below, or use <Link to="/forgot-password" className="text-primary font-medium hover:underline">forgot password</Link> to reset it.</p>
        </div>
      }

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
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            <Link to="/forgot-password" className="text-sm text-primary hover:underline">
              Forgot password?
            </Link>
          </div>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="pl-10 h-12"
              required />
            
          </div>
        </div>
        <Button type="submit" className="w-full h-12 font-medium" disabled={loading} style={{ background: "#3f3830", color: "#f7f1e8" }}>
          {loading ?
          <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Logging in...
            </> :

          "Log in"
          }
        </Button>
      </form>
    </AuthLayout>);

}