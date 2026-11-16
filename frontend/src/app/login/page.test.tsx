import { render, screen } from "@testing-library/react";
import { vi } from "vitest";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

import LoginPage from "./page";

describe("LoginPage", () => {
  it("renders the sign-in form and CTA", () => {
    render(<LoginPage />);

    expect(screen.getByText("Sign in to your workspace")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
    expect(screen.getByLabelText("Password")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /need an account\?/i })).toBeInTheDocument();
  });
});
