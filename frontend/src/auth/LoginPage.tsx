/**
 * LoginPage — Two-step authentication page.
 *
 * Step 1: Email + password (credentials step).
 * Step 2: MFA TOTP / recovery code (shown when API returns mfa_required).
 *
 * Redirects to the original destination (passed via location.state.from
 * by ProtectedRoute) on successful authentication, or /appraisals as fallback.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/auth/useAuth";
import { LoginForm } from "./components/LoginForm";
import { MFAVerifyForm } from "./components/MFAVerifyForm";

type Step = "credentials" | "mfa";

function LoginPage() {
  const {
    login,
    verifyMFA,
    isAuthenticated,
    user,
    mfaSetupRequired,
    logout,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  // ProtectedRoute passes the original pathname in location.state.from
  const redirectTo = (location.state as { from?: string } | null)?.from ?? "/appraisals";

  const [step, setStep] = useState<Step>("credentials");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState<number | null>(null);
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [rememberMe, setRememberMe] = useState(false);

  const rememberMeRef = useRef(false);
  const cardContentRef = useRef<HTMLDivElement>(null);
  // True while this LoginPage instance is in the middle of (or just
  // completed) its own submit.  Prevents the mount-time effect below from
  // racing with the submit handler's own navigation/state updates.
  const submittedFromThisPageRef = useRef(false);

  // Authenticated users hitting /login are either:
  //   (a) Mid-flow with an incomplete required step (must_change_password
  //       or MFA setup) — they used the browser back button to escape the
  //       gating page.  Treat this as an abandoned login: clear the
  //       session so the fresh /login form is shown, forcing them to
  //       re-authenticate from scratch.
  //   (b) Already fully signed in — bounce them to their destination.
  // Skip both branches if the auth state was set by THIS page's submit
  // handler — handleLogin owns its own navigation in that case.
  useEffect(() => {
    if (!isAuthenticated || submittedFromThisPageRef.current) {
      return;
    }
    const hasIncompleteStep =
      user?.must_change_password === true ||
      (mfaSetupRequired && user !== null && !user.is_mfa_enabled);
    if (hasIncompleteStep) {
      void logout();
      return;
    }
    void navigate(redirectTo, { replace: true });
  }, [isAuthenticated, user, mfaSetupRequired, logout, navigate, redirectTo]);

  // Focus card content when step changes to MFA
  useEffect(() => {
    if (step === "mfa") {
      cardContentRef.current?.focus();
    }
  }, [step]);

  const handleRememberMeChange = useCallback((value: boolean) => {
    setRememberMe(value);
    rememberMeRef.current = value;
  }, []);

  const handleLogin = useCallback(
    async (identifier: string, password: string, captchaToken?: string) => {
      setIsLoading(true);
      setError(null);
      submittedFromThisPageRef.current = true;

      const result = await login(identifier, password, captchaToken, rememberMe);

      setIsLoading(false);

      if (result.success) {
        void navigate(redirectTo, { replace: true });
        return;
      }

      if (result.mfaRequired && result.mfaToken) {
        setMfaToken(result.mfaToken);
        setStep("mfa");
        setMfaError(null);
        return;
      }

      // Handle error -- override message for the SPA-role guard so the
      // operator sees a friendly admin-redirect prompt regardless of the
      // raw API copy.
      if (result.errorCode === "NO_SPA_ROLES_ASSIGNED") {
        setError(
          "This account is reserved for system administration. " +
            "Please sign in at /admin.",
        );
      } else {
        setError(result.error ?? "Invalid credentials. Please try again.");
      }

      // Use structured lockout data from the API response
      if (result.lockoutSeconds != null && result.lockoutSeconds > 0) {
        setLockoutSeconds(result.lockoutSeconds);
      }

      // Use backend-driven captcha requirement
      if (result.captchaRequired) {
        setCaptchaRequired(true);
      }
    },
    [login, navigate, redirectTo, rememberMe],
  );

  const handleMfaSubmit = useCallback(
    async (code: string) => {
      if (!mfaToken) return;
      setIsLoading(true);
      setMfaError(null);

      const result = await verifyMFA(mfaToken, code, false, rememberMeRef.current);

      setIsLoading(false);

      if (result.success) {
        void navigate(redirectTo, { replace: true });
        return;
      }

      if (result.errorCode === "NO_SPA_ROLES_ASSIGNED") {
        setMfaError(
          "This account is reserved for system administration. " +
            "Please sign in at /admin.",
        );
        return;
      }

      setMfaError(result.error ?? "Incorrect code. Please try again.");
    },
    [mfaToken, verifyMFA, navigate, redirectTo],
  );

  const handleRecoveryCode = useCallback(
    async (code: string) => {
      if (!mfaToken) return;
      setIsLoading(true);
      setMfaError(null);

      const result = await verifyMFA(mfaToken, code, true, rememberMeRef.current);

      setIsLoading(false);

      if (result.success) {
        void navigate(redirectTo, { replace: true });
        return;
      }

      if (result.errorCode === "NO_SPA_ROLES_ASSIGNED") {
        setMfaError(
          "This account is reserved for system administration. " +
            "Please sign in at /admin.",
        );
        return;
      }

      setMfaError(
        result.error ?? "Invalid recovery code. Please try again.",
      );
    },
    [mfaToken, verifyMFA, navigate, redirectTo],
  );

  const handleBackToLogin = useCallback(() => {
    setStep("credentials");
    setMfaToken(null);
    setMfaError(null);
  }, []);

  return (
    <main
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12"
      aria-label="Sign in to MINCOM Appraisal"
    >
      <a
        href="#main-form"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 bg-white px-4 py-2 rounded text-sm font-medium text-primary focus-visible:ring-2 focus-visible:ring-secondary"
      >
        Skip to form
      </a>

      <div className="mb-8 text-center">
        <img
          src={`${import.meta.env.BASE_URL}images/logo-login.png`}
          srcSet={`${import.meta.env.BASE_URL}images/logo-login@2x.png 2x`}
          alt="Minerals Commission Ghana"
          className="w-24 h-24 mx-auto mb-4 object-contain"
        />
        <span className="text-2xl font-bold tracking-tight text-primary block">
          MINCOM
        </span>
        <span className="block text-xs font-medium text-gray-500 mt-1 tracking-widest uppercase">
          Performance Appraisal
        </span>
      </div>

      <Card className="w-full max-w-md shadow-md border-gray-200">
        {step === "credentials" && (
          <div className="px-8 pt-8 pb-2">
            <h1 className="text-2xl font-semibold text-gray-900">Sign in</h1>
            <p className="text-sm text-gray-500 mt-1">
              Use your MINCOM account credentials.
            </p>
          </div>
        )}

        {step === "mfa" && (
          <div className="px-8 pt-8 pb-2">
            <Button
              variant="ghost"
              className="text-sm text-secondary hover:text-primary-dark hover:bg-primary-light -ml-2 mb-4 h-8 px-2"
              onClick={handleBackToLogin}
            >
              &larr; Back to login
            </Button>
          </div>
        )}

        <CardContent
          id="main-form"
          className="px-8 pb-8 pt-4"
          tabIndex={-1}
          ref={cardContentRef}
        >
          {step === "credentials" ? (
            <LoginForm
              onSubmit={handleLogin}
              isLoading={isLoading}
              error={error}
              captchaRequired={captchaRequired}
              lockoutSeconds={lockoutSeconds}
              rememberMe={rememberMe}
              onRememberMeChange={handleRememberMeChange}
            />
          ) : (
            <MFAVerifyForm
              onSubmit={handleMfaSubmit}
              onRecoveryCode={handleRecoveryCode}
              isLoading={isLoading}
              error={mfaError}
            />
          )}
        </CardContent>
      </Card>

    </main>
  );
}

export default LoginPage;
