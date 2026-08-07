/**
 * UnauthorizedPage — Displayed when an authenticated user tries to
 * access a route their role does not permit.
 */

import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function UnauthorizedPage() {
  const navigate = useNavigate();

  const handleGoBack = () => {
    void navigate("/dashboard", { replace: true });
  };

  return (
    <main
      className="flex min-h-screen items-center justify-center bg-gray-50 px-4"
      aria-label="Access denied"
    >
      <Card className="w-full max-w-md shadow-md border-gray-200">
        <CardContent className="px-8 py-12 text-center">
          <div
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100"
            aria-hidden="true"
          >
            <svg
              className="h-8 w-8 text-red-600"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636"
              />
            </svg>
          </div>

          <h1 className="text-2xl font-semibold text-gray-900">
            Access Denied
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            You do not have the required permissions to access this page.
            Contact your administrator if you believe this is an error.
          </p>

          <Button
            onClick={handleGoBack}
            className="mt-6 bg-secondary hover:bg-primary text-white"
          >
            Go to Dashboard
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
