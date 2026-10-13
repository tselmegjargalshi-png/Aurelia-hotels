import { Link } from '../lib/router.js';
import { useSeo } from '../lib/seo.js';
import { EmptyState } from '../components/ui.js';

export function NotFoundPage() {
  useSeo({ title: 'Page not found', noindex: true });
  return (
    <div className="container narrow section">
      <EmptyState title="We couldn’t find that page" action={<div className="empty-actions"><Link className="btn btn-primary" to="/">Return home</Link><Link className="btn btn-outline" to="/hotels">Browse hotels</Link></div>}>
        The link may be out of date, or the page may have moved.
      </EmptyState>
    </div>
  );
}
