/**
 * ForgotPasswordPage — Public page for requesting a password reset link.
 *
 * Renders a centered card with an email input. On submit, calls the
 * password reset request API. Always shows the same confirmation
 * message regardless of API response (account-enumeration safe).
 *
 * Authenticated users are redirected to /appraisals.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CheckCircle2, Loader2 } from "lucide-react";
import { useAuth } from "@/auth/useAuth";
import { requestPasswordReset } from "@/api/auth-api";
import { EMAIL_REGEX } from "@/utils/validation";

function ForgotPasswordPage() {
  const { isAuthenticated } = useAuth();

  const [email, setEmail] = useState("");
  const [emailError, setEmailError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  const validateEmail = useCallback((value: string): boolean => {
    if (!value.trim()) {
      setEmailError("Email is required.");
      return false;
    }
    if (!EMAIL_REGEX.test(value)) {
      setEmailError("Please enter a valid email address.");
      return false;
    }
    setEmailError(null);
    return true;
  }, []);

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!validateEmail(email)) return;

      setIsLoading(true);
      try {
        await requestPasswordReset(email);
      } catch {
        // Always show same confirmation — account-enumeration safe
      } finally {
        setIsLoading(false);
        setSubmitted(true);
      }
    },
    [email, validateEmail],
  );

  if (isAuthenticated) {
    return <Navigate to="/appraisals" replace />;
  }

  return (
    <main
      className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4 py-12"
      aria-label="Reset your password"
    >
      <a
        href="#reset-form"
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
        <CardContent id="reset-form" className="px-8 py-8">
          <h1 className="text-2xl font-semibold text-gray-900">
            Reset your password
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-6">
            Enter your email and we&apos;ll send you a reset link.
          </p>

          {submitted ? (
            <div aria-live="polite">
              <Alert variant="success">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
                <AlertDescription>
                  If that email is registered, a reset link has been sent.
                </AlertDescription>
              </Alert>
            </div>
          ) : (
            <form
              onSubmit={(e) => void handleSubmit(e)}
              className="space-y-4"
              noValidate
            >
              <div className="space-y-1">
                <Label htmlFor="email">
                  Email address{" "}
                  <span className="text-red-600" aria-hidden="true">
                    *
                  </span>
                </Label>
                <Input
                  ref={emailRef}
                  id="email"
                  type="email"
                  autoComplete="email"
                  aria-required="true"
                  aria-invalid={emailError ? "true" : undefined}
                  aria-describedby={emailError ? "email-error" : undefined}
                  placeholder="name@mincom.gov.gh"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                />
                {emailError && (
                  <p
                    id="email-error"
                    className="text-sm text-red-700"
                    aria-live="polite"
                  >
                    {emailError}
                  </p>
                )}
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
                aria-busy={isLoading}
                aria-label={
                  isLoading ? "Sending reset link, please wait" : "Send reset link"
                }
              >
                {isLoading && (
                  <Loader2
                    className="mr-2 h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                )}
                {isLoading ? "Sending\u2026" : "Send reset link"}
              </Button>
            </form>
          )}

          <div className="mt-6 text-center">
            <Link
              to="/login"
              className="text-sm font-medium text-secondary hover:text-primary-dark hover:underline"
            >
              &larr; Back to sign in
            </Link>
          </div>
        </CardContent>
      </Card>
    </main>
  );
}

export default ForgotPasswordPage;
