import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import DataTable, { RowAction, toDate, fmtDate } from "./DataTable";

const rows = [
  { id: 1, name: "Charlie", room: "10", status: "in" },
  { id: 2, name: "alice", room: "2", status: "out" },
  { id: 3, name: "Bob", room: "", status: "in" },
];
const columns = [
  { key: "name", header: "Name" },
  { key: "room", header: "Room" },
];

/** Names in the desktop table body, top to bottom. */
const tableNames = () =>
  within(screen.getByRole("table"))
    .getAllByRole("row")
    .slice(1)
    .map((r) => within(r).getAllByRole("cell")[0].textContent);

describe("DataTable", () => {
  it("renders rows and a count", () => {
    render(<DataTable rows={rows} columns={columns} />);
    expect(tableNames()).toEqual(["Charlie", "alice", "Bob"]);
    expect(screen.getByText("3 items")).toBeInTheDocument();
  });

  it("searches across columns and can clear the search", async () => {
    const user = userEvent.setup();
    render(<DataTable rows={rows} columns={columns} />);
    await user.type(screen.getByLabelText("Search table"), "ALI");
    expect(tableNames()).toEqual(["alice"]);
    expect(screen.getByText("1 of 3")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Search table"));
    await user.type(screen.getByLabelText("Search table"), "zzz");
    expect(screen.getByText(/No results for/)).toBeInTheDocument();
    // the empty-state link (the ✕ in the search box does the same)
    await user.click(screen.getAllByRole("button", { name: "Clear search" }).at(-1));
    expect(tableNames()).toHaveLength(3);
  });

  it("sorts ascending, descending, then off; numbers naturally; blanks last", async () => {
    const user = userEvent.setup();
    render(<DataTable rows={rows} columns={columns} />);
    const roomHeader = screen.getByRole("button", { name: /Room/ });

    await user.click(roomHeader);
    expect(tableNames()).toEqual(["alice", "Charlie", "Bob"]); // 2, 10, blank
    await user.click(roomHeader);
    expect(tableNames()).toEqual(["Charlie", "alice", "Bob"]); // 10, 2, blank still last
    await user.click(roomHeader);
    expect(tableNames()).toEqual(["Charlie", "alice", "Bob"]); // original order

    await user.click(screen.getByRole("button", { name: /Name/ }));
    expect(tableNames()).toEqual(["alice", "Bob", "Charlie"]); // case-insensitive
  });

  it("filters with tabs that show counts", async () => {
    const user = userEvent.setup();
    const filters = [
      { key: "all", label: "All", test: () => true },
      { key: "in", label: "In", test: (r) => r.status === "in" },
    ];
    render(<DataTable rows={rows} columns={columns} filters={filters} />);
    const inTab = screen.getByRole("tab", { name: /In/ });
    expect(inTab).toHaveTextContent("2");
    await user.click(inTab);
    expect(inTab).toHaveAttribute("aria-selected", "true");
    expect(tableNames()).toEqual(["Charlie", "Bob"]);
  });

  it("paginates and resets to page 1 when searching", async () => {
    const user = userEvent.setup();
    const many = Array.from({ length: 23 }, (_, i) => ({ id: i, name: `Guest ${i + 1}`, room: String(i + 1) }));
    render(<DataTable rows={many} columns={columns} defaultPageSize={10} />);
    expect(screen.getByText("1 / 3")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    expect(screen.getByText("2 / 3")).toBeInTheDocument();
    expect(tableNames()[0]).toBe("Guest 11");

    await user.type(screen.getByLabelText("Search table"), "Guest 2");
    // "Guest 2" and "Guest 20"–"Guest 23" fit on one page, so the pager disappears
    expect(screen.queryByRole("button", { name: "Next page" })).not.toBeInTheDocument();
    expect(tableNames()).toEqual(["Guest 2", "Guest 20", "Guest 21", "Guest 22", "Guest 23"]);
  });

  it("renders row actions without triggering row clicks", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    const onRowClick = vi.fn();
    render(
      <DataTable
        rows={rows.slice(0, 1)}
        columns={columns}
        onRowClick={onRowClick}
        rowActions={(r) => <RowAction onClick={() => onEdit(r.id)}>Edit</RowAction>}
      />
    );
    // one button in the phone card, one in the table
    const buttons = screen.getAllByRole("button", { name: "Edit" });
    await user.click(buttons[buttons.length - 1]);
    expect(onEdit).toHaveBeenCalledWith(1);
    expect(onRowClick).not.toHaveBeenCalled();
  });

  it("shows a skeleton while loading and an empty message when there is no data", () => {
    const { rerender, container } = render(<DataTable rows={[]} columns={columns} loading />);
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    rerender(<DataTable rows={[]} columns={columns} emptyText="No keys yet." />);
    expect(screen.getByText("No keys yet.")).toBeInTheDocument();
  });

  describe("CSV export", () => {
    let blobs;
    beforeEach(() => {
      blobs = [];
      URL.createObjectURL = vi.fn((b) => (blobs.push(b), "blob:x"));
      URL.revokeObjectURL = vi.fn();
      vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {});
    });

    it("exports visible rows with escaped values", async () => {
      const user = userEvent.setup();
      const data = [{ id: 1, name: 'Smith, "J"', room: "5" }];
      render(<DataTable rows={data} columns={columns} exportName="guests" />);
      await user.click(screen.getByRole("button", { name: /Export/ }));
      const bytes = new Uint8Array(await blobs[0].arrayBuffer());
      expect([...bytes.slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf]); // BOM so Excel reads UTF-8
      expect(await blobs[0].text()).toBe('Name,Room\r\n"Smith, ""J""",5');
    });
  });
});

describe("date helpers", () => {
  it("parses DB timestamps with a space or T", () => {
    expect(toDate("2026-11-04 10:30").getHours()).toBe(10);
    expect(toDate("2026-11-04T10:30").getMinutes()).toBe(30);
    expect(toDate("nope")).toBeNull();
    expect(toDate("")).toBeNull();
  });

  it("formats dates and handles blanks", () => {
    expect(fmtDate("")).toBe("—");
    expect(fmtDate("2020-01-02 09:05")).toMatch(/2020/); // other years show the year
  });
});
