import FormPanelInner from "./FormPanelInner";

/** Large Apple-style page heading used at the top of every admin page. */
export default function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8 k-fade-in">
      <div>
        {eyebrow && <p className="k-eyebrow">{eyebrow}</p>}
        <h1 className="k-title mt-2">{title}</h1>
        {subtitle && <p className="k-subtitle">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

/** Message banner; tone picked from the text when not given. */
export function Notice({ children, tone }) {
  if (!children) return null;
  const text = String(children);
  const t =
    tone ||
    (/fail|error|invalid|cannot|could not|couldn|❌/i.test(text)
      ? "error"
      : /✅|success|saved|updated|deleted|linked|sent/i.test(text)
        ? "success"
        : "info");
  const cls = t === "error" ? "k-alert-error" : t === "success" ? "k-alert-success" : "k-alert-info";
  return <div className={`${cls} mb-6`}>{children}</div>;
}

/**
 * Full-width form panel that folds open. Closed by default; `forceOpen`
 * (e.g. while editing a row) keeps it open.
 */
export function FormPanel({ title, addLabel = "Add", forceOpen = false, children }) {
  return (
    <FormPanelInner title={title} addLabel={addLabel} forceOpen={forceOpen}>
      {children}
    </FormPanelInner>
  );
}
