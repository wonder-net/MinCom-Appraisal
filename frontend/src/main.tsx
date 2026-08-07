import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import * as Sentry from "@sentry/react";
import { AuthProvider } from "@/auth";
import App from "./App";
import "./index.css";

const sentryDsn = import.meta.env.VITE_SENTRY_DSN as string | undefined;

if (sentryDsn) {
  Sentry.init({
    dsn: sentryDsn,
    environment: (import.meta.env.VITE_ENVIRONMENT as string) || "development",
    release: (import.meta.env.VITE_APP_VERSION as string) || "dev",
    tracesSampleRate: 0.2,
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    sendDefaultPii: false,
  });
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found. Ensure index.html contains a div with id='root'.");
}

createRoot(rootElement).render(
  <StrictMode>
    <Sentry.ErrorBoundary
      fallback={<SentryFallback />}
    >
      <AuthProvider>
        <App />
      </AuthProvider>
    </Sentry.ErrorBoundary>
  </StrictMode>,
);

function SentryFallback() {
  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gray-50 px-4 text-center"
      role="alert"
    >
      <h1 className="text-xl font-semibold text-gray-900">
        Something went wrong
      </h1>
      <p className="mt-2 text-gray-600">
        An unexpected error occurred. Please refresh the page.
      </p>
      <button
        type="button"
        className="mt-4 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2"
        onClick={() => window.location.reload()}
      >
        Refresh page
      </button>
    </div>
  );
}
