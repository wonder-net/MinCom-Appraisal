/**
 * Unit tests for LoginPage, LoginForm, MFAVerifyForm, and RecoveryCodesDisplay.
 *
 * Covers all acceptance criteria from TASK-038 testing requirements.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { type ReactNode } from "react";
import { LoginForm } from "../components/LoginForm";
import { MFAVerifyForm } from "../components/MFAVerifyForm";
import { RecoveryCodesDisplay } from "../components/RecoveryCodesDisplay";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function renderInRouter(ui: ReactNode) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

// ---------------------------------------------------------------------------
// LoginForm Tests
// ---------------------------------------------------------------------------

describe("LoginForm", () => {
  const defaultProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    captchaRequired: false,
    lockoutSeconds: null,
    rememberMe: false,
    onRememberMeChange: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders identifier and password inputs", () => {
    renderInRouter(<LoginForm {...defaultProps} />);

    expect(screen.getByLabelText(/email or PF number/i)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: /email or PF number/i })).toBeInTheDocument();
    expect(screen.getByPlaceholderText("••••••••")).toBeInTheDocument();
  });

  it("calls onSubmit with correct values when identifier is an email", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    const identifierInput = screen.getByLabelText(/email or PF number/i);
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await userEvent.type(identifierInput, "user@mincom.com");
    await userEvent.type(passwordInput, "testpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "user@mincom.com",
        "testpassword",
        undefined,
      );
    });
  });

  it("calls onSubmit with an employee number identifier (e.g. MIN1234)", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    const identifierInput = screen.getByLabelText(/email or PF number/i);
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await userEvent.type(identifierInput, "MIN1234");
    await userEvent.type(passwordInput, "testpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "MIN1234",
        "testpassword",
        undefined,
      );
    });
  });

  it("does NOT apply strict email regex to the identifier field", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    const identifierInput = screen.getByLabelText(/email or PF number/i);

    // Type a non-email identifier and blur — should NOT show an email format error.
    await userEvent.type(identifierInput, "MIN1234");
    await userEvent.tab();

    expect(
      screen.queryByText(/valid email address/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/invalid email/i),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/email format/i),
    ).not.toBeInTheDocument();
  });

  it("trims whitespace from the identifier before submitting", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    const identifierInput = screen.getByLabelText(/email or PF number/i);
    const passwordInput = screen.getByPlaceholderText("••••••••");

    await userEvent.type(identifierInput, "  MIN1234  ");
    await userEvent.type(passwordInput, "testpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith(
        "MIN1234",
        "testpassword",
        undefined,
      );
    });
  });

  it("shows the new required error message when identifier is empty on submit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<LoginForm {...defaultProps} onSubmit={onSubmit} />);

    const passwordInput = screen.getByPlaceholderText("••••••••");
    await userEvent.type(passwordInput, "testpassword");
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/email or PF number is required/i),
      ).toBeInTheDocument();
    });
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("uses input type=text and autoComplete=username on the identifier field", () => {
    renderInRouter(<LoginForm {...defaultProps} />);
    const input = screen.getByLabelText(
      /email or PF number/i,
    ) as HTMLInputElement;
    expect(input.type).toBe("text");
    expect(input.autocomplete).toBe("username");
    // inputMode should not be set to "email" anymore.
    expect(input.getAttribute("inputmode")).not.toBe("email");
  });

  it("sets aria-invalid and aria-describedby on validation error", async () => {
    renderInRouter(<LoginForm {...defaultProps} />);
    const input = screen.getByLabelText(/email or PF number/i);

    // Submit while empty to trigger validation.
    await userEvent.click(screen.getByRole("button", { name: /sign in/i }));

    await waitFor(() => {
      expect(input).toHaveAttribute("aria-invalid", "true");
      expect(input).toHaveAttribute("aria-describedby", "identifier-error");
    });
  });

  it("displays error message when error prop is set", () => {
    renderInRouter(
      <LoginForm {...defaultProps} error="Invalid credentials" />,
    );

    expect(screen.getByText("Invalid credentials")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows CAPTCHA widget when captchaRequired is true and site key is configured", () => {
    const original = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    import.meta.env.VITE_TURNSTILE_SITE_KEY = "test-site-key";
    try {
      renderInRouter(<LoginForm {...defaultProps} captchaRequired={true} />);

      expect(screen.getByTestId("turnstile-widget")).toBeInTheDocument();
    } finally {
      import.meta.env.VITE_TURNSTILE_SITE_KEY = original;
    }
  });

  it("does not show CAPTCHA widget when captchaRequired is true but site key is not configured", () => {
    const original = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    delete import.meta.env.VITE_TURNSTILE_SITE_KEY;
    try {
      renderInRouter(<LoginForm {...defaultProps} captchaRequired={true} />);

      expect(screen.queryByTestId("turnstile-widget")).not.toBeInTheDocument();
    } finally {
      import.meta.env.VITE_TURNSTILE_SITE_KEY = original;
    }
  });

  it("shows lockout countdown when lockoutSeconds > 0", () => {
    renderInRouter(<LoginForm {...defaultProps} lockoutSeconds={30} />);

    expect(screen.getByText(/account locked/i)).toBeInTheDocument();
    expect(screen.getByText(/30 second/)).toBeInTheDocument();
  });

  it("disables submit button during lockout", () => {
    renderInRouter(<LoginForm {...defaultProps} lockoutSeconds={10} />);

    const button = screen.getByRole("button", { name: /sign in/i });
    expect(button).toBeDisabled();
  });

  it("disables submit button while loading", () => {
    renderInRouter(<LoginForm {...defaultProps} isLoading={true} />);

    const button = screen.getByRole("button", { name: /signing in/i });
    expect(button).toBeDisabled();
  });

  it("renders 'Keep me signed in' checkbox unchecked by default", () => {
    renderInRouter(<LoginForm {...defaultProps} />);

    const checkbox = screen.getByRole("checkbox", {
      name: /keep me signed in/i,
    });
    expect(checkbox).toBeInTheDocument();
    expect(checkbox).not.toBeChecked();
  });

  it("calls onRememberMeChange(true) when checkbox is clicked", async () => {
    const onRememberMeChange = vi.fn();
    renderInRouter(
      <LoginForm {...defaultProps} onRememberMeChange={onRememberMeChange} />,
    );

    const checkbox = screen.getByRole("checkbox", {
      name: /keep me signed in/i,
    });
    await userEvent.click(checkbox);

    expect(onRememberMeChange).toHaveBeenCalledWith(true);
  });

  it("renders a link to the public 'Logging In' guide after the submit button", () => {
    renderInRouter(<LoginForm {...defaultProps} />);
    const link = screen.getByRole("link", { name: /read the guide/i });
    expect(link.getAttribute("href")).toBe(
      "/help/public/getting-started/logging-in",
    );
  });

  it("renders a link to the public 'First-time setup' guide near the email field", () => {
    renderInRouter(<LoginForm {...defaultProps} />);
    const link = screen.getByRole("link", { name: /first-time setup guide/i });
    expect(link.getAttribute("href")).toBe(
      "/help/public/getting-started/first-time-sign-in",
    );
  });
});

// ---------------------------------------------------------------------------
// MFAVerifyForm Tests
// ---------------------------------------------------------------------------

describe("MFAVerifyForm", () => {
  const defaultProps = {
    onSubmit: vi.fn().mockResolvedValue(undefined),
    onRecoveryCode: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders 6-digit code input", () => {
    renderInRouter(<MFAVerifyForm {...defaultProps} />);

    const input = screen.getByLabelText(/6-digit verification code/i);
    expect(input).toBeInTheDocument();
    expect(input).toHaveAttribute("maxLength", "6");
    expect(input).toHaveAttribute("inputMode", "numeric");
  });

  it("calls onSubmit with entered code", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderInRouter(<MFAVerifyForm {...defaultProps} onSubmit={onSubmit} />);

    const input = screen.getByLabelText(/6-digit verification code/i);
    await userEvent.type(input, "123456");
    await userEvent.click(screen.getByRole("button", { name: /verify code/i }));

    await waitFor(() => {
      expect(onSubmit).toHaveBeenCalledWith("123456");
    });
  });

  it("shows recovery code input when link is clicked", async () => {
    renderInRouter(<MFAVerifyForm {...defaultProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    expect(screen.getByPlaceholderText("XXXX-XXXX-XXXX")).toBeInTheDocument();
    expect(screen.getByText(/enter recovery code/i)).toBeInTheDocument();
  });

  it("calls onRecoveryCode with entered recovery code", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    renderInRouter(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    const input = screen.getByPlaceholderText("XXXX-XXXX-XXXX");
    await userEvent.type(input, "ABCD-1234-EFGH");
    await userEvent.click(
      screen.getByRole("button", { name: /use recovery code$/i }),
    );

    await waitFor(() => {
      expect(onRecoveryCode).toHaveBeenCalledWith("ABCD-1234-EFGH");
    });
  });

  it("displays error message when error prop is set", () => {
    renderInRouter(
      <MFAVerifyForm {...defaultProps} error="Invalid code" />,
    );

    expect(screen.getByText("Invalid code")).toBeInTheDocument();
    expect(screen.getByRole("alert")).toBeInTheDocument();
  });

  it("shows format error and does not call onRecoveryCode for invalid-format recovery code", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    renderInRouter(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    const input = screen.getByPlaceholderText("XXXX-XXXX-XXXX");
    await userEvent.type(input, "ABCDEFGH");
    await userEvent.click(
      screen.getByRole("button", { name: /use recovery code$/i }),
    );

    await waitFor(() => {
      expect(
        screen.getByText("Recovery code must match the format XXXX-XXXX-XXXX."),
      ).toBeInTheDocument();
    });
    expect(onRecoveryCode).not.toHaveBeenCalled();
  });

  it("does not call onRecoveryCode when recovery code is empty", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    renderInRouter(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    // Leave input empty and submit
    await userEvent.click(
      screen.getByRole("button", { name: /use recovery code$/i }),
    );

    expect(onRecoveryCode).not.toHaveBeenCalled();
  });

  it("calls onRecoveryCode with no error for valid format recovery code", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    renderInRouter(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    const input = screen.getByPlaceholderText("XXXX-XXXX-XXXX");
    await userEvent.type(input, "ABCD-1234-EFGH");
    await userEvent.click(
      screen.getByRole("button", { name: /use recovery code$/i }),
    );

    await waitFor(() => {
      expect(onRecoveryCode).toHaveBeenCalledWith("ABCD-1234-EFGH");
    });
    expect(
      screen.queryByText("Recovery code must match the format XXXX-XXXX-XXXX."),
    ).not.toBeInTheDocument();
  });

  it("normalises lowercase recovery codes to uppercase before calling onRecoveryCode", async () => {
    const onRecoveryCode = vi.fn().mockResolvedValue(undefined);
    renderInRouter(
      <MFAVerifyForm {...defaultProps} onRecoveryCode={onRecoveryCode} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /use a recovery code instead/i }),
    );

    const input = screen.getByPlaceholderText("XXXX-XXXX-XXXX");
    await userEvent.type(input, "abcd-1234-efgh");
    await userEvent.click(
      screen.getByRole("button", { name: /use recovery code$/i }),
    );

    await waitFor(() => {
      expect(onRecoveryCode).toHaveBeenCalledWith("ABCD-1234-EFGH");
    });
  });
});

// ---------------------------------------------------------------------------
// RecoveryCodesDisplay Tests
// ---------------------------------------------------------------------------

describe("RecoveryCodesDisplay", () => {
  const testCodes = [
    "AAAA-1111",
    "BBBB-2222",
    "CCCC-3333",
    "DDDD-4444",
    "EEEE-5555",
    "FFFF-6666",
  ];
  const defaultProps = {
    codes: testCodes,
    onConfirm: vi.fn(),
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows all codes and copy button", () => {
    renderInRouter(<RecoveryCodesDisplay {...defaultProps} />);

    for (const code of testCodes) {
      expect(screen.getByText(code)).toBeInTheDocument();
    }

    expect(
      screen.getByRole("button", { name: /copy codes to clipboard/i }),
    ).toBeInTheDocument();
  });

  it("shows download button", () => {
    renderInRouter(<RecoveryCodesDisplay {...defaultProps} />);

    expect(
      screen.getByRole("button", {
        name: /download recovery codes as text file/i,
      }),
    ).toBeInTheDocument();
  });

  it("shows confirm button", () => {
    renderInRouter(<RecoveryCodesDisplay {...defaultProps} />);

    expect(
      screen.getByRole("button", { name: /i have saved these codes/i }),
    ).toBeInTheDocument();
  });

  it("calls onConfirm when confirm button is clicked", async () => {
    const onConfirm = vi.fn();
    renderInRouter(
      <RecoveryCodesDisplay {...defaultProps} onConfirm={onConfirm} />,
    );

    await userEvent.click(
      screen.getByRole("button", { name: /i have saved these codes/i }),
    );

    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("shows 'Failed' when clipboard API rejects", async () => {
    // Mock clipboard to reject
    const originalClipboard = navigator.clipboard;
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: vi.fn().mockRejectedValue(new Error("Not allowed")),
      },
      writable: true,
      configurable: true,
    });

    renderInRouter(<RecoveryCodesDisplay {...defaultProps} />);

    await userEvent.click(
      screen.getByRole("button", { name: /copy codes to clipboard/i }),
    );

    await waitFor(() => {
      expect(screen.getByText("Failed")).toBeInTheDocument();
    });

    // Restore
    Object.defineProperty(navigator, "clipboard", {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });
});
