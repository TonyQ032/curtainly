/** Search box for admin lists. A plain GET form, so it works without JavaScript and is linkable. */
export function ListToolbar({
  q,
  placeholder = 'Search',
  children,
}: {
  q: string;
  placeholder?: string;
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
        <button type="submit">Search</button>
      </form>
      {children}
    </div>
  );
}
