/**
 * Unit tests for LoginPage, LoginForm, MFAVerifyForm, and RecoveryCodesDisplay.
 *
 * Covers: form rendering, validation, submit flows, MFA transition,
 * lockout countdown, CAPTCHA display, recovery codes, and navigation.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import type { ReactNode } from "react";
import { LoginForm } from "@/auth/components/LoginForm";
import { MFAVerifyForm } from "@/auth/components/MFAVerifyForm";
import { RecoveryCodesDisplay } from "@/auth/components/RecoveryCodesDisplay";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock("@/auth/useAuth", () => ({
  useAuth: () => mockAuthContext,
}));

let mockAuthContext = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  accessToken: null,
  login: vi.fn(),
  verifyMFA: vi.fn(),
  logout: vi.fn(),
};

function Wrapper({ children }: { children: ReactNode }) {
  return <MemoryRouter initialEntries={["/login"]}>{children}</MemoryRouter>;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockAuthContext = {
    user: null,
    isAuthenticated: false,
    isLoading: false,
    accessToken: null,
    login: vi.fn(),
    verifyMFA: vi.fn(),
    logout: vi.fn(),
  };
  mockNavigate.mockReset();
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Gets the password input by its explicit id to avoid aria-label conflicts. */
function getPasswordInput() {
  return document.getElementById("password") as HTMLInputElement;
}

// ---------------------------------------------------------------------------
// LoginForm
// ---------------------------------------------------------------------------

describe("LoginForm", () => {
  const defaultProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    captchaRequired: false,
    lockoutSeconds: null,
  };

  it("renders email and password inputs", () => {
    render(<LoginForm {...defaultProps} />, { wrapper: Wrapper });

    expect(screen.getByLabelText(/email or PF number/i)).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
  });

  it("renders the sign in button", () => {
    render(<LoginForm {...defaultProps} />, { wrapper: Wrapper });

    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeInTheDocument();
  });

  it("calls onSubmit with correct values", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <LoginForm {...defaultProps} onSubmit={onSubmit} />,
      { wrapper: Wrapper },
    );

    await user.type(screen.getByLabelText(/email or PF number/i), "test@mincom.com");
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      "test@mincom.com",
      "Password123",
      undefined,
    );
  });

  it("displays error message when error prop is set", () => {
    render(
      <LoginForm {...defaultProps} error="Invalid credentials. Please try again." />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByText("Invalid credentials. Please try again."),
    ).toBeInTheDocument();
  });

  it("accepts a non-email identifier (PF number) without showing an email-format error", async () => {
    // TASK-300 dropped strict email-format validation: the field now
    // accepts either an organisational email OR a PF number.  Confirm a
    // non-email-shaped value (e.g. a PF number) does NOT trigger any
    // "invalid email" inline error.
    const user = userEvent.setup();

    render(<LoginForm {...defaultProps} />, { wrapper: Wrapper });

    const identifierInput = screen.getByLabelText(/email or PF number/i);
    await user.type(identifierInput, "MIN1234");
    await user.tab();

    expect(
      screen.queryByText("Please enter a valid email address."),
    ).not.toBeInTheDocument();
  });

  it("does not submit with empty email", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <LoginForm {...defaultProps} onSubmit={onSubmit} />,
      { wrapper: Wrapper },
    );

    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows CAPTCHA widget when captchaRequired is true and site key is configured", () => {
    const original = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    import.meta.env.VITE_TURNSTILE_SITE_KEY = "test-site-key";
    try {
      render(
        <LoginForm {...defaultProps} captchaRequired={true} />,
        { wrapper: Wrapper },
      );

      expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
    } finally {
      import.meta.env.VITE_TURNSTILE_SITE_KEY = original;
    }
  });

  it("does not show CAPTCHA widget when captchaRequired is false", () => {
    render(
      <LoginForm {...defaultProps} captchaRequired={false} />,
      { wrapper: Wrapper },
    );

    expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();
  });

  it("does not show CAPTCHA widget when captchaRequired is true but site key is not configured", () => {
    const original = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
    try {
      render(
        <LoginForm {...defaultProps} captchaRequired={true} />,
        { wrapper: Wrapper },
      );

      expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();
    } finally {
      import.meta.env.VITE_TURNSTILE_SITE_KEY = original;
    }
  });

  it("does not disable submit button for CAPTCHA when site key is not configured", async () => {
    const original = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
    try {
      const onSubmit = vi.fn().mockResolvedValue(undefined);
      const user = userEvent.setup();

      render(
        <LoginForm {...defaultProps} onSubmit={onSubmit} captchaRequired={true} />,
        { wrapper: Wrapper },
      );

      await user.type(screen.getByLabelText(/email or PF number/i), "test@mincom.com");
      await user.type(getPasswordInput(), "Password123");

      const button = screen.getByRole("button", { name: /sign in/i });
      expect(button).not.toBeDisabled();

      await user.click(button);

      expect(onSubmit).toHaveBeenCalledWith(
        "test@mincom.com",
        "Password123",
        undefined,
      );
    } finally {
      import.meta.env.VITE_TURNSTILE_SITE_KEY = original;
    }
  });

  it("shows lockout countdown when lockoutSeconds > 0", () => {
    render(
      <LoginForm {...defaultProps} lockoutSeconds={47} />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByText(/account locked.*47 seconds/i),
    ).toBeInTheDocument();
  });

  it("disables submit button when loading", () => {
    render(
      <LoginForm {...defaultProps} isLoading={true} />,
      { wrapper: Wrapper },
    );

    const button = screen.getByRole("button", {
      name: /signing in, please wait/i,
    });
    expect(button).toBeDisabled();
  });

  it("shows loading text when isLoading is true", () => {
    render(
      <LoginForm {...defaultProps} isLoading={true} />,
      { wrapper: Wrapper },
    );

    // Match the disabled submit button (its accessible label is "Signing in,
    // please wait"). A bare /signing in/i text query also matches the
    // "Need help signing in?" guidance link, so anchor on the button.
    expect(
      screen.getByRole("button", { name: /signing in, please wait/i }),
    ).toBeInTheDocument();
  });

  it("toggles password visibility", async () => {
    const user = userEvent.setup();

    render(<LoginForm {...defaultProps} />, { wrapper: Wrapper });

    const passwordInput = getPasswordInput();
    expect(passwordInput.type).toBe("password");

    const toggleButton = screen.getByRole("button", {
      name: /show password/i,
    });
    await user.click(toggleButton);

    expect(passwordInput.type).toBe("text");

    const hideButton = screen.getByRole("button", {
      name: /hide password/i,
    });
    await user.click(hideButton);

    expect(passwordInput.type).toBe("password");
  });

  it("disables submit button when locked out", () => {
    render(
      <LoginForm {...defaultProps} lockoutSeconds={30} />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByRole("button", { name: /sign in/i }),
    ).toBeDisabled();
  });
});

// ---------------------------------------------------------------------------
// MFAVerifyForm
// ---------------------------------------------------------------------------

describe("MFAVerifyForm", () => {
  const defaultProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onRecoveryCode: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
  };

  it("renders 6-digit code input", () => {
    render(<MFAVerifyForm {...defaultProps} />, { wrapper: Wrapper });

    const input = screen.getByLabelText("6-digit verification code");
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("maxLength", "6");
    expect(input).toHaveAttribute("inputMode", "numeric");
  });

  it("renders heading and description", () => {
    render(<MFAVerifyForm {...defaultProps} />, { wrapper: Wrapper });

    expect(
      screen.getByText("Two-Factor Authentication"),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Enter the 6-digit code from your authenticator app.",
      ),
    ).toBeInTheDocument();
  });

  it("calls onSubmit with entered code", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MFAVerifyForm {...defaultProps} onSubmit={onSubmit} />,
      { wrapper: Wrapper },
    );

    await user.type(
      screen.getByLabelText("6-digit verification code"),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    expect(onSubmit).toHaveBeenCalledWith("123456");
  });

  it("shows recovery code input when link is clicked", async () => {
    const user = userEvent.setup();

    render(<MFAVerifyForm {...defaultProps} />, { wrapper: Wrapper });

    // Initially TOTP mode
    expect(
      screen.getByLabelText("6-digit verification code"),
    ).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /use a recovery code instead/i,
      }),
    );

    // Now recovery mode
    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();
    expect(screen.getByText("Enter Recovery Code")).toBeInTheDocument();
    expect(
      screen.queryByLabelText("6-digit verification code"),
    ).not.toBeInTheDocument();
  });

  it("calls onRecoveryCode when in recovery mode", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", {
        name: /use a recovery code instead/i,
      }),
    );

    await user.type(
      screen.getByLabelText("Recovery code"),
      "ABCD-EFGH-IJKL",
    );
    await user.click(
      screen.getByRole("button", { name: /use recovery code/i }),
    );

    expect(onRecoveryCode).toHaveBeenCalledWith("ABCD-EFGH-IJKL");
  });

  it("displays error message when error prop is set", () => {
    render(
      <MFAVerifyForm
        {...defaultProps}
        error="Incorrect code. Please try again."
      />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByText("Incorrect code. Please try again."),
    ).toBeInTheDocument();
  });

  it("only accepts numeric input in TOTP field", async () => {
    const user = userEvent.setup();

    render(<MFAVerifyForm {...defaultProps} />, { wrapper: Wrapper });

    const input = screen.getByLabelText(
      "6-digit verification code",
    ) as HTMLInputElement;
    await user.type(input, "12ab34");

    expect(input.value).toBe("1234");
  });

  it("does not submit when TOTP code is incomplete", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const user = userEvent.setup();

    render(
      <MFAVerifyForm {...defaultProps} onSubmit={onSubmit} />,
      { wrapper: Wrapper },
    );

    await user.type(
      screen.getByLabelText("6-digit verification code"),
      "123",
    );
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("toggles back to TOTP mode from recovery mode", async () => {
    const user = userEvent.setup();

    render(<MFAVerifyForm {...defaultProps} />, { wrapper: Wrapper });

    await user.click(
      screen.getByRole("button", {
        name: /use a recovery code instead/i,
      }),
    );

    expect(screen.getByLabelText("Recovery code")).toBeInTheDocument();

    await user.click(
      screen.getByRole("button", {
        name: /use authenticator code instead/i,
      }),
    );

    expect(
      screen.getByLabelText("6-digit verification code"),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RecoveryCodesDisplay
// ---------------------------------------------------------------------------

describe("RecoveryCodesDisplay", () => {
  const testCodes = [
    "AAAA-BBBB-CCCC",
    "DDDD-EEEE-FFFF",
    "GGGG-HHHH-IIII",
    "JJJJ-KKKK-LLLL",
  ];

  it("shows all codes", () => {
    render(
      <RecoveryCodesDisplay codes={testCodes} onConfirm={vi.fn()} />,
      { wrapper: Wrapper },
    );

    for (const code of testCodes) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }
  });

  it("shows copy button", () => {
    render(
      <RecoveryCodesDisplay codes={testCodes} onConfirm={vi.fn()} />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByRole("button", { name: /copy codes to clipboard/i }),
    ).toBeInTheDocument();
  });

  it("shows download button", () => {
    render(
      <RecoveryCodesDisplay codes={testCodes} onConfirm={vi.fn()} />,
      { wrapper: Wrapper },
    );

    expect(
      screen.getByRole("button", {
        name: /download recovery codes/i,
      }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when confirmation button is clicked", async () => {
    const onConfirm = vi.fn();
    const user = userEvent.setup();

    render(
      <RecoveryCodesDisplay codes={testCodes} onConfirm={onConfirm} />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /i have saved these codes/i }),
    );

    expect(onConfirm).toHaveBeenCalledOnce();
  });

  it("shows 'Copied' text after copy button click", async () => {
    // Mock clipboard at the global level before userEvent.setup
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      writable: true,
      configurable: true,
    });

    const user = userEvent.setup({ writeToClipboard: false });

    render(
      <RecoveryCodesDisplay codes={testCodes} onConfirm={vi.fn()} />,
      { wrapper: Wrapper },
    );

    await user.click(
      screen.getByRole("button", { name: /copy codes to clipboard/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Copied")).toBeInTheDocument();
    });
  });
});

// ---------------------------------------------------------------------------
// LoginPage — Integration
// ---------------------------------------------------------------------------

describe("LoginPage", () => {
  // Import dynamically to leverage mocks
  async function renderLoginPage() {
    const { default: LoginPage } = await import("@/auth/LoginPage");
    return render(<LoginPage />, { wrapper: Wrapper });
  }

  it("renders the sign in heading and form", async () => {
    await renderLoginPage();

    expect(
      screen.getByRole("heading", { name: /sign in/i }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/email or PF number/i)).toBeInTheDocument();
    expect(getPasswordInput()).toBeInTheDocument();
  });

  it("renders the logo", async () => {
    await renderLoginPage();

    expect(screen.getByText("MINCOM")).toBeInTheDocument();
    expect(screen.getByText("Performance Appraisal")).toBeInTheDocument();
  });

  it("transitions from login form to MFA form on mfa_required response", async () => {
    mockAuthContext.login.mockResolvedValue({
      success: false,
      mfaRequired: true,
      mfaToken: "mfa-token-abc",
    });

    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Two-Factor Authentication"),
      ).toBeInTheDocument();
    });

    expect(
      screen.getByLabelText("6-digit verification code"),
    ).toBeInTheDocument();
  });

  it("redirects to /appraisals on successful authentication", async () => {
    mockAuthContext.login.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/appraisals", {
        replace: true,
      });
    });
  });

  it("displays error on failed login", async () => {
    mockAuthContext.login.mockResolvedValue({
      success: false,
      error: "Invalid credentials. Please try again.",
    });

    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "wrong");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Invalid credentials. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("navigates back from MFA step to credentials step", async () => {
    mockAuthContext.login.mockResolvedValue({
      success: false,
      mfaRequired: true,
      mfaToken: "mfa-token-abc",
    });

    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Two-Factor Authentication"),
      ).toBeInTheDocument();
    });

    await user.click(
      screen.getByRole("button", { name: /back to login/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByRole("heading", { name: /sign in/i }),
      ).toBeInTheDocument();
    });
  });

  it("redirects to /appraisals after successful MFA verification", async () => {
    mockAuthContext.login.mockResolvedValue({
      success: false,
      mfaRequired: true,
      mfaToken: "mfa-token-abc",
    });
    mockAuthContext.verifyMFA.mockResolvedValue({ success: true });

    const user = userEvent.setup();
    await renderLoginPage();

    // Step 1: credentials
    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    // Step 2: MFA
    await waitFor(() => {
      expect(
        screen.getByLabelText("6-digit verification code"),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("6-digit verification code"),
      "123456",
    );
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(mockNavigate).toHaveBeenCalledWith("/appraisals", {
        replace: true,
      });
    });
  });

  it("displays MFA error on failed verification", async () => {
    mockAuthContext.login.mockResolvedValue({
      success: false,
      mfaRequired: true,
      mfaToken: "mfa-token-abc",
    });
    mockAuthContext.verifyMFA.mockResolvedValue({
      success: false,
      error: "Incorrect code. Please try again.",
    });

    const user = userEvent.setup();
    await renderLoginPage();

    await user.type(
      screen.getByLabelText(/email or PF number/i),
      "test@mincom.com",
    );
    await user.type(getPasswordInput(), "Password123");
    await user.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByLabelText("6-digit verification code"),
      ).toBeInTheDocument();
    });

    await user.type(
      screen.getByLabelText("6-digit verification code"),
      "000000",
    );
    await user.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(
        screen.getByText("Incorrect code. Please try again."),
      ).toBeInTheDocument();
    });
  });

  it("has proper accessibility: main landmark and skip nav", async () => {
    await renderLoginPage();

    expect(
      screen.getByRole("main", { name: /sign in to mincom appraisal/i }),
    ).toBeInTheDocument();
    expect(screen.getByText("Skip to form")).toBeInTheDocument();
  });
});
