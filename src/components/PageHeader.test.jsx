import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PageHeader, { Notice, FormPanel } from "./PageHeader";

describe("PageHeader", () => {
  it("shows eyebrow, title and subtitle", () => {
    render(<PageHeader eyebrow="Keys" title="All keys" subtitle="Every key." />);
    expect(screen.getByRole("heading", { level: 1, name: "All keys" })).toBeInTheDocument();
    expect(screen.getByText("Every key.")).toBeInTheDocument();
  });
});

describe("Notice", () => {
  it.each([
    ["❌ Failed to save", "k-alert-error"],
    ["✅ Key saved.", "k-alert-success"],
    ["Editing Key 101", "k-alert-info"],
  ])("%s → %s", (text, cls) => {
    render(<Notice>{text}</Notice>);
    expect(screen.getByText(text)).toHaveClass(cls);
  });

  it("renders nothing without a message", () => {
    const { container } = render(<Notice>{""}</Notice>);
    expect(container).toBeEmptyDOMElement();
  });
});

describe("FormPanel", () => {
  it("is closed by default and opens on click", async () => {
    const user = userEvent.setup();
    render(
      <FormPanel title="Add guest" addLabel="Add guest">
        <p>form body</p>
      </FormPanel>
    );
    expect(screen.queryByText("form body")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Add guest/ }));
    expect(screen.getByText("form body")).toBeInTheDocument();
  });

  it("stays open while editing", () => {
    render(
      <FormPanel title="Edit guest" forceOpen>
        <p>form body</p>
      </FormPanel>
    );
    expect(screen.getByText("form body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Editing/ })).toBeInTheDocument();
  });
});
