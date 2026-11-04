"use client";
import { useMemo, useState } from "react";

/**
 * One table for the whole app: search, sort, filter tabs, pagination,
 * CSV export, loading/empty states, and a card layout on phones.
 *
 * columns: [{
 *   key: string,                       // unique id
 *   header: string,
 *   value?: (row) => any,              // used for search, sort and CSV (default: row[key])
 *   cell?: (row) => ReactNode,         // how it looks (default: value)
 *   sortable?: boolean (default true),
 *   search?: boolean (default true),
 *   export?: boolean (default true),
 *   align?: "left" | "right",
 *   mobile?: "title" | "subtitle" | "badge" | "meta" | "hide"
 *     phone list role: title = bold first line, subtitle = small text beside it,
 *     badge = right-hand status, meta = grey second line (joined with " · "),
 *     hide = never on phones; anything else appears when the row is expanded
 *   mobileCell?: (row) => ReactNode   // phone title/subtitle/badge look (default: cell)
 *   mobileText?: (row) => string      // phone meta text (default: value)
 *   width?: string                     // e.g. "120px"
 *   nowrap?: boolean                   // keep the cell on one line
 * }]
 * filters: [{ key, label, test: (row) => boolean }]  // first one is the default
 */
export default function DataTable({
  title,
  subtitle,
  rows = [],
  columns,
  getRowId = (r, i) => r.id ?? i,
  loading = false,
  searchPlaceholder = "Search",
  filters,
  defaultFilter,
  toolbar,
  defaultSort,
  pageSizes = [10, 25, 50, 100],
  defaultPageSize = 25,
  exportName,
  emptyText = "Nothing here yet.",
  rowActions,
  rowClassName,
  onRowClick,
}) {
  const [query, setQueryRaw] = useState("");
  const [filter, setFilterRaw] = useState(defaultFilter || filters?.[0]?.key || null);
  const [sort, setSortRaw] = useState(defaultSort || null); // { key, dir: "asc" | "desc" }
  const [pageSize, setPageSizeRaw] = useState(defaultPageSize);
  const [page, setPage] = useState(1);
  const [expanded, setExpanded] = useState(null); // phone list: id of the open row

  // Any change to what is shown sends the user back to page 1.
  const resetting = (setter) => (value) => {
    setter(value);
    setPage(1);
  };
  const setQuery = resetting(setQueryRaw);
  const setFilter = resetting(setFilterRaw);
  const setSort = resetting(setSortRaw);
  const setPageSize = resetting(setPageSizeRaw);

  const valueOf = (col, row) => (col.value ? col.value(row) : row?.[col.key]);

  const filterCounts = useMemo(() => {
    if (!filters) return {};
    return Object.fromEntries(filters.map((f) => [f.key, rows.filter(f.test).length]));
  }, [rows, filters]);

  const processed = useMemo(() => {
    let out = rows;
    const activeFilter = filters?.find((f) => f.key === filter);
    if (activeFilter) out = out.filter(activeFilter.test);

    const q = query.trim().toLowerCase();
    if (q) {
      const searchCols = columns.filter((c) => c.search !== false);
      out = out.filter((row) => searchCols.some((c) => toText(valueOf(c, row)).toLowerCase().includes(q)));
    }

    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col) {
        const dir = sort.dir === "desc" ? -1 : 1;
        out = [...out].sort((a, b) => {
          const va = valueOf(col, a);
          const vb = valueOf(col, b);
          // Blanks stay at the bottom in both directions.
          if (isEmpty(va) || isEmpty(vb)) return isEmpty(va) - isEmpty(vb);
          return dir * compare(va, vb);
        });
      }
    }
    return out;
  }, [rows, columns, filters, filter, query, sort]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const start = (safePage - 1) * pageSize;
  const visible = processed.slice(start, start + pageSize);

  const toggleSort = (col) => {
    if (col.sortable === false) return;
    if (!sort || sort.key !== col.key) setSort({ key: col.key, dir: "asc" });
    else if (sort.dir === "asc") setSort({ key: col.key, dir: "desc" });
    else setSort(null); // third click clears sorting
  };

  const exportCsv = () => {
    const cols = columns.filter((c) => c.export !== false);
    const lines = [
      cols.map((c) => csvCell(c.header)).join(","),
      ...processed.map((row) => cols.map((c) => csvCell(toText(valueOf(c, row)))).join(",")),
    ];
    const blob = new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${exportName || "export"}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const titleCol = columns.find((c) => c.mobile === "title") || columns[0];
  const subtitleCol = columns.find((c) => c.mobile === "subtitle");
  const badgeCol = columns.find((c) => c.mobile === "badge");
  const metaCols = columns.filter((c) => c.mobile === "meta");
  const detailCols = columns.filter(
    (c) => c !== titleCol && c !== subtitleCol && c !== badgeCol && !["meta", "hide"].includes(c.mobile)
  );
  const metaText = (row) =>
    metaCols
      .map((c) => {
        if (c.mobileText) return c.mobileText(row) || "";
        const v = valueOf(c, row);
        return v instanceof Date ? formatDate(v) : toText(v);
      })
      .filter(Boolean)
      .join(" · ");

  const render = (col, row, mobile = false) => {
    const v = mobile && col.mobileCell ? col.mobileCell(row) : col.cell ? col.cell(row) : valueOf(col, row);
    if (v === null || v === undefined || v === "") return <span className="k-faint">—</span>;
    return v instanceof Date ? formatDate(v) : v;
  };

  return (
    <section className="k-card !p-0 overflow-hidden">
      {/* Header */}
      <div className="p-5 sm:p-7 pb-4 sm:pb-4 space-y-4">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            {title && <h2 className="k-h2">{title}</h2>}
            {subtitle && <p className="text-[14px] k-muted mt-1">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <svg
                className="absolute left-3.5 top-1/2 -translate-y-1/2"
                width="15"
                height="15"
                viewBox="0 0 16 16"
                aria-hidden="true"
              >
                <circle cx="7" cy="7" r="5.2" fill="none" stroke="#86868b" strokeWidth="1.6" />
                <path d="M11 11l3.5 3.5" stroke="#86868b" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label="Search table"
                className="k-input !pl-10 !pr-9 !py-2.5 !rounded-full !bg-[#f5f5f7] !border-transparent"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-[#c7c7cc] text-white text-[11px] leading-5"
                >
                  ✕
                </button>
              )}
            </div>
            <button
              onClick={exportCsv}
              disabled={!processed.length}
              className="k-btn-secondary !py-2.5 !px-4 !text-[14px] shrink-0"
              title="Download as CSV (Excel)"
            >
              <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
                <path
                  d="M8 2v8m0 0l-3-3m3 3l3-3M3 12.5h10"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
              <span className="hidden sm:inline">Export</span>
            </button>
          </div>
        </div>

        {(filters || toolbar) && (
          <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:justify-between">
            {filters ? (
              <div className="-mx-1 px-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <div className="inline-flex rounded-full bg-[#f5f5f7] p-1" role="tablist">
                  {filters.map((f) => (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={filter === f.key}
                      onClick={() => setFilter(f.key)}
                      className={`whitespace-nowrap rounded-full px-3.5 py-1.5 text-[13px] font-medium transition ${
                        filter === f.key ? "bg-white shadow-sm text-[#1d1d1f]" : "text-[#6e6e73] hover:text-[#1d1d1f]"
                      }`}
                    >
                      {f.label}
                      <span className="ml-1.5 text-[12px] k-faint">{filterCounts[f.key]}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <span />
            )}
            {toolbar && <div className="flex flex-wrap items-center gap-2">{toolbar}</div>}
          </div>
        )}
      </div>

      {/* Body */}
      {loading ? (
        <div className="px-5 sm:px-7 pb-7 space-y-3">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-black/[0.04] animate-pulse" />
          ))}
        </div>
      ) : processed.length === 0 ? (
        <div className="px-6 pb-12 pt-6 text-center">
          <div className="text-3xl">{query ? "🔍" : "🗂️"}</div>
          <p className="mt-3 font-medium">{query ? `No results for “${query}”` : emptyText}</p>
          {query && (
            <button className="k-link text-[14px] mt-1" onClick={() => setQuery("")}>
              Clear search
            </button>
          )}
        </div>
      ) : (
        <>
          {/* Phones: compact grouped list; tap a row to see details and actions */}
          <ul className="md:hidden mx-4 mb-2 rounded-2xl bg-[#f5f5f7] divide-y divide-black/[0.06] overflow-hidden">
            {visible.map((row, i) => {
              const id = getRowId(row, start + i);
              const open = expanded === id;
              const hasMore = detailCols.length > 0 || !!rowActions;
              return (
                <li key={id} className={rowClassName?.(row) || ""}>
                  <button
                    type="button"
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left active:bg-black/[0.04]"
                    aria-expanded={hasMore ? open : undefined}
                    onClick={() => (onRowClick ? onRowClick(row) : hasMore && setExpanded(open ? null : id))}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-2 min-w-0">
                        <span className="font-semibold text-[16px] truncate">{render(titleCol, row, true)}</span>
                        {subtitleCol && (
                          <span className="text-[13px] k-faint truncate">{render(subtitleCol, row, true)}</span>
                        )}
                      </div>
                      {metaCols.length > 0 && (
                        <div className="mt-0.5 text-[13px] k-muted truncate">{metaText(row) || "—"}</div>
                      )}
                    </div>
                    {badgeCol && <div className="shrink-0">{render(badgeCol, row, true)}</div>}
                    {(hasMore || onRowClick) && (
                      <svg
                        width="8"
                        height="13"
                        viewBox="0 0 8 13"
                        aria-hidden="true"
                        className={`shrink-0 transition-transform duration-200 ${open ? "rotate-90" : ""}`}
                      >
                        <path d="M1.5 1.5l5 5-5 5" fill="none" stroke="#c7c7cc" strokeWidth="2" strokeLinecap="round" />
                      </svg>
                    )}
                  </button>
                  {open && (
                    <div className="px-4 pb-4 k-fade-in">
                      {detailCols.length > 0 && (
                        <dl className="rounded-xl bg-white divide-y divide-black/[0.06] text-[14px]">
                          {detailCols.map((c) => (
                            <div key={c.key} className="flex items-start justify-between gap-4 px-3.5 py-2.5">
                              <dt className="k-muted shrink-0">{c.header}</dt>
                              <dd className="text-right min-w-0 break-words">{render(c, row)}</dd>
                            </div>
                          ))}
                        </dl>
                      )}
                      {rowActions && <div className="mt-3 flex flex-wrap gap-2">{rowActions(row)}</div>}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {/* Larger screens: table */}
          <div className="hidden md:block overflow-x-auto px-2 sm:px-3">
            <table className="k-table">
              <thead>
                <tr>
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    const sortable = c.sortable !== false;
                    return (
                      <th
                        key={c.key}
                        style={c.width ? { width: c.width } : undefined}
                        className={c.align === "right" ? "text-right" : ""}
                        aria-sort={active ? (sort.dir === "asc" ? "ascending" : "descending") : undefined}
                      >
                        {sortable ? (
                          <button
                            onClick={() => toggleSort(c)}
                            className={`group inline-flex items-center gap-1 uppercase tracking-wide ${active ? "text-[#1d1d1f]" : ""}`}
                          >
                            {c.header}
                            <SortIcon dir={active ? sort.dir : null} />
                          </button>
                        ) : (
                          c.header
                        )}
                      </th>
                    );
                  })}
                  {rowActions && <th className="text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr
                    key={getRowId(row, start + i)}
                    className={`${onRowClick ? "cursor-pointer" : ""} ${rowClassName?.(row) || ""}`}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {columns.map((c) => (
                      <td
                        key={c.key}
                        className={`${c.align === "right" ? "text-right" : ""} ${c.nowrap ? "whitespace-nowrap" : ""}`}
                      >
                        {render(c, row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5">{rowActions(row)}</div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-5 sm:px-7 py-4 border-t border-black/5 text-[13px] k-muted">
            <div>
              {processed.length === rows.length
                ? `${rows.length} ${rows.length === 1 ? "item" : "items"}`
                : `${processed.length} of ${rows.length}`}
              {pageCount > 1 && ` · showing ${start + 1}–${Math.min(start + pageSize, processed.length)}`}
            </div>
            <div className="flex items-center gap-3">
              <label className="flex items-center gap-2">
                Rows
                <select
                  value={pageSize}
                  onChange={(e) => setPageSize(Number(e.target.value))}
                  className="rounded-lg bg-[#f5f5f7] px-2 py-1 text-[#1d1d1f] outline-none"
                >
                  {pageSizes.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
              {pageCount > 1 && (
                <div className="flex items-center gap-1">
                  <PageBtn disabled={safePage === 1} onClick={() => setPage(safePage - 1)} label="Previous page">
                    ‹
                  </PageBtn>
                  <span className="px-2 text-[#1d1d1f]">
                    {safePage} / {pageCount}
                  </span>
                  <PageBtn disabled={safePage === pageCount} onClick={() => setPage(safePage + 1)} label="Next page">
                    ›
                  </PageBtn>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

/* ── small pieces ── */

function SortIcon({ dir }) {
  return (
    <svg
      width="9"
      height="12"
      viewBox="0 0 9 12"
      aria-hidden="true"
      className={dir ? "" : "opacity-0 group-hover:opacity-60 transition-opacity"}
    >
      <path d="M4.5 1L8 5H1z" fill={dir === "asc" ? "#0071e3" : dir ? "#c7c7cc" : "#86868b"} />
      <path d="M4.5 11L1 7h7z" fill={dir === "desc" ? "#0071e3" : dir ? "#c7c7cc" : "#86868b"} />
    </svg>
  );
}

function PageBtn({ children, disabled, onClick, label }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="h-8 w-8 rounded-full text-[18px] leading-none text-[#1d1d1f] hover:bg-black/5 disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {children}
    </button>
  );
}

/** Small action button for rowActions. tone: "default" | "primary" | "danger" */
export function RowAction({ children, onClick, tone = "default", disabled, title }) {
  const tones = {
    default: "bg-[#e8e8ed] text-[#1d1d1f] hover:bg-[#dedee3]",
    primary: "bg-[#0071e3] text-white hover:bg-[#0077ed]",
    danger: "bg-[#fdecee] text-[#d70015] hover:bg-[#fbdfe2]",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      className={`rounded-full px-3 py-1 text-[13px] font-medium transition disabled:opacity-40 ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

function toText(v) {
  if (v === null || v === undefined) return "";
  if (v instanceof Date) return isNaN(v) ? "" : v.toISOString();
  return String(v);
}

function isEmpty(v) {
  return v === null || v === undefined || v === "" || (v instanceof Date && isNaN(v));
}

function compare(a, b) {
  if (a instanceof Date && b instanceof Date) return a - b;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean") return a === b ? 0 : a ? -1 : 1;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: "base" });
}

function csvCell(s) {
  const v = String(s ?? "");
  return /[",\r\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

function formatDate(d) {
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleString(undefined, {
    ...(sameYear ? {} : { year: "numeric" }),
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Parse DB timestamps ("2026-11-04 10:00" or ISO) into Date, or null. */
export function toDate(v) {
  if (!v) return null;
  const d = new Date(String(v).replace(" ", "T"));
  return isNaN(d) ? null : d;
}

export function fmtDate(v) {
  const d = v instanceof Date ? v : toDate(v);
  return d ? formatDate(d) : "—";
}
