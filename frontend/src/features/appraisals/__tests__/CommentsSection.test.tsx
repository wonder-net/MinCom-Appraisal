/**
 * Tests for CommentsSection — verifies rendering, write form visibility,
 * comment posting, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CommentsSection } from "../components/CommentsSection";
import type { Comment } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockListComments = vi.fn<
  (appraisalId: string) => Promise<Comment[]>
>();
const mockCreateComment = vi.fn<
  (
    appraisalId: string,
    body: { content: string },
  ) => Promise<Comment>
>();

vi.mock("@/api/comments", () => ({
  listComments: (...args: unknown[]) =>
    mockListComments(args[0] as string),
  createComment: (...args: unknown[]) =>
    mockCreateComment(
      args[0] as string,
      args[1] as { content: string },
    ),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeComment(overrides: Partial<Comment> = {}): Comment {
  return {
    id: "c-001",
    appraisal_id: "a-001",
    author_id: "u-001",
    author_name: "Kwame Asante",
    author_role: "APPRAISER",
    content: "Good progress this quarter.",
    created_at: "2026-03-14T10:42:00Z",
    ...overrides,
  };
}

function makeApiResponse(comments: Comment[]): Comment[] {
  return comments;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.clearAllMocks();
});

describe("CommentsSection", () => {
  it("renders comment list with correct author badges and timestamps", async () => {
    const comments = [
      makeComment({
        id: "c-001",
        author_name: "Kwame Asante",
        author_role: "APPRAISER",
        content: "Good progress this quarter.",
        created_at: "2026-03-14T10:42:00Z",
      }),
      makeComment({
        id: "c-002",
        author_name: "Adjoa Mensah",
        author_role: "APPRAISEE",
        content: "Thank you for the feedback.",
        created_at: "2026-03-14T11:05:00Z",
      }),
    ];
    mockListComments.mockResolvedValueOnce(makeApiResponse(comments));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    // Wait for loading to finish
    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    // Both comments rendered
    expect(screen.getByText("Good progress this quarter.")).toBeInTheDocument();
    expect(screen.getByText("Thank you for the feedback.")).toBeInTheDocument();

    // Author names rendered
    expect(screen.getByText("Kwame Asante")).toBeInTheDocument();
    expect(screen.getByText("Adjoa Mensah")).toBeInTheDocument();

    // Role badges rendered
    expect(screen.getByText("Appraisor")).toBeInTheDocument();
    expect(screen.getByText("Appraisee")).toBeInTheDocument();

    // Comment count
    expect(screen.getByText("2 comments")).toBeInTheDocument();
  });

  it("shows text input and submit button when status=DISCUSSION and userRelation=APPRAISEE", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post Comment" })).toBeInTheDocument();
  });

  it("hides submit form when userRelation=NONE", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="NONE"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Post Comment" }),
    ).not.toBeInTheDocument();
  });

  it("renders comment list read-only with no input when status=SIGNED_OFF", async () => {
    const comments = [
      makeComment({ id: "c-001", content: "Final review completed." }),
    ];
    mockListComments.mockResolvedValueOnce(makeApiResponse(comments));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("Final review completed.")).toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Post Comment" }),
    ).not.toBeInTheDocument();
  });

  it("shows comment form for HR_ADMIN on SIGNED_OFF appraisal", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="HR_ADMIN"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post Comment" })).toBeInTheDocument();
  });

  it("hides submit form for FINALISED status", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="FINALISED"
        userRelation="APPRAISER"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });

  it("calls createComment with correct args when user submits a comment", async () => {
    const user = userEvent.setup();
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    const newComment = makeComment({
      id: "c-new",
      content: "New comment here",
      author_role: "APPRAISEE",
      author_name: "Adjoa Mensah",
    });
    mockCreateComment.mockResolvedValueOnce(newComment);

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText("Add a comment");
    await user.type(textarea, "New comment here");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    await waitFor(() => {
      expect(mockCreateComment).toHaveBeenCalledWith("a-001", {
        content: "New comment here",
      });
    });

    // New comment appears in list
    await waitFor(() => {
      expect(screen.getByText("New comment here")).toBeInTheDocument();
    });
  });

  it("shows inline error when createComment rejects", async () => {
    const user = userEvent.setup();
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    const axiosError = {
      isAxiosError: true,
      response: {
        status: 400,
        data: { data: { message: "You do not have permission to comment." } },
      },
    };
    mockCreateComment.mockRejectedValueOnce(axiosError);

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    const textarea = screen.getByLabelText("Add a comment");
    await user.type(textarea, "Some comment");
    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    await waitFor(() => {
      expect(screen.getByRole("alert")).toBeInTheDocument();
    });
  });

  it("shows validation error when submitting empty comment", async () => {
    const user = userEvent.setup();
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole("button", { name: "Post Comment" }));

    expect(screen.getByText("Comment cannot be empty")).toBeInTheDocument();
    expect(mockCreateComment).not.toHaveBeenCalled();
  });

  it("shows comment form for isHRAdmin=true with userRelation=APPRAISEE on SIGNED_OFF appraisal", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISEE"
        isHRAdmin
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post Comment" })).toBeInTheDocument();
  });

  it("shows comment form for isHRAdmin=true with userRelation=APPRAISER on SIGNED_OFF appraisal", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISER"
        isHRAdmin
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.getByLabelText("Add a comment")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Post Comment" })).toBeInTheDocument();
  });

  it("hides comment form for non-HR user on SIGNED_OFF when isHRAdmin=false", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="SIGNED_OFF"
        userRelation="APPRAISER"
        isHRAdmin={false}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByLabelText("Loading comments")).not.toBeInTheDocument();
    });

    expect(screen.queryByLabelText("Add a comment")).not.toBeInTheDocument();
  });

  it("shows empty state when no comments exist", async () => {
    mockListComments.mockResolvedValueOnce(makeApiResponse([]));

    render(
      <CommentsSection
        appraisalId="a-001"
        status="DISCUSSION"
        userRelation="APPRAISEE"
      />,
    );

    await waitFor(() => {
      expect(screen.getByText("No comments yet")).toBeInTheDocument();
    });

    expect(
      screen.getByText("Be the first to add a comment to this appraisal."),
    ).toBeInTheDocument();
  });
});
