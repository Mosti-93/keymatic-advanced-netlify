import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import PlatformSelect from "./PlatformSelect";

function Harness({ initial = "", onValue = () => {} }) {
  const [v, setV] = useState(initial);
  return (
    <PlatformSelect
      id="p"
      value={v}
      onChange={(e) => {
        setV(e.target.value);
        onValue(e.target);
      }}
    />
  );
}

describe("PlatformSelect", () => {
  it("is a dropdown of known platforms", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await user.selectOptions(screen.getByRole("combobox"), "Booking.com");
    expect(onValue).toHaveBeenLastCalledWith({ name: "platform", value: "Booking.com" });
    expect(screen.queryByLabelText("Other platform")).not.toBeInTheDocument();
  });

  it("'Other…' shows a text box for any platform", async () => {
    const user = userEvent.setup();
    const onValue = vi.fn();
    render(<Harness onValue={onValue} />);
    await user.selectOptions(screen.getByRole("combobox"), "Other…");
    await user.type(screen.getByLabelText("Other platform"), "Expedia");
    expect(onValue).toHaveBeenLastCalledWith({ name: "platform", value: "Expedia" });
  });

  it("shows a saved custom platform when editing", () => {
    render(<Harness initial="Expedia" />);
    expect(screen.getByRole("combobox")).toHaveValue("__other__");
    expect(screen.getByLabelText("Other platform")).toHaveValue("Expedia");
  });
});
