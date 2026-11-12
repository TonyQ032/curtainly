/**
 * Search box and optional filters for admin lists. A plain GET form, so it works
 * without JavaScript and every filtered view is a shareable link.
 */
export function ListToolbar({
  q,
  placeholder = 'Search',
  filters,
  children,
}: {
  q: string;
  placeholder?: string;
  /** Extra form controls (selects) submitted with the search. */
  filters?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="list-toolbar">
      <form role="search" className="search">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          aria-label={placeholder}
        />
        {filters}
        <button type="submit">{filters ? 'Apply' : 'Search'}</button>
      </form>
      {children}
    </div>
  );
}

/** A labelled <select> for ListToolbar filters. Empty value means "any". */
export function FilterSelect({
  name,
  label,
  value,
  options,
}: {
  name: string;
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
}) {
  return (
    <select name={name} defaultValue={value ?? ''} aria-label={label} className="filter">
      <option value="">{label}: any</option>
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}
