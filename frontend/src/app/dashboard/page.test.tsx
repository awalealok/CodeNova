import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/dashboard",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock("@/lib/api", () => ({
  ApiError: class ApiError extends Error {},
  DEMO_AUTH_MODE: false,
  getCurrentUser: vi.fn().mockResolvedValue({
    id: "user-1",
    name: "Test User",
    email: "test@example.com",
    role: "admin",
    workspace_id: "workspace-1",
    workspace_name: "Test Workspace",
  }),
  getInsightsSummary: vi.fn().mockResolvedValue({
    submissions: 3,
    findings: 2,
    pending_reviews: 1,
    guidelines: 1,
  }),
  listContent: vi.fn().mockResolvedValue([]),
  listGuidelines: vi.fn().mockResolvedValue([]),
  listRules: vi.fn().mockResolvedValue([]),
  listFacts: vi.fn().mockResolvedValue([]),
  listAuditEvents: vi.fn().mockResolvedValue([]),
  isSessionAuthenticated: () => true,
  setSessionAuthenticated: vi.fn(),
  signOut: vi.fn(),
  useAuthenticatedSession: () => true,
}));

import DashboardPage from "./page";

describe("DashboardPage", () => {
  it("renders counts loaded from the workspace API", async () => {
    render(<DashboardPage />);

    expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
    expect(await screen.findByText("Submissions")).toBeInTheDocument();
    expect(screen.getByText("Pending reviews")).toBeInTheDocument();
    expect(screen.getByText("Guidelines")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
  });
});
