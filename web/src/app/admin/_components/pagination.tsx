import Link from 'next/link';
import { listHref, pageCount, type SearchParams } from '@/lib/list-params';

export function Pagination({
  pathname,
  searchParams,
  page,
  pageSize,
  total,
}: {
  pathname: string;
  searchParams: SearchParams;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pages = pageCount(total, pageSize);
  const href = (p: number) => listHref(pathname, searchParams, { page: p });

  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="muted">
        {total} {total === 1 ? 'result' : 'results'} · page {Math.min(page, pages)} of {pages}
      </span>
      <span className="pagination-links">
        {page > 1 ? (
          <Link href={href(page - 1)}>← Previous</Link>
        ) : (
          <span aria-hidden>← Previous</span>
        )}
        {page < pages ? <Link href={href(page + 1)}>Next →</Link> : <span aria-hidden>Next →</span>}
      </span>
    </nav>
  );
}
