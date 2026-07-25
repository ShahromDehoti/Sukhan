import { Link } from "react-router";

export function NotFoundRoute(): React.JSX.Element {
  return (
    <div className="not-found">
      <h2 className="section-heading">Not found</h2>
      <p>That page doesn&rsquo;t exist, or the unit was removed.</p>
      <Link to="/" className="primary-button">
        Back to home
      </Link>
    </div>
  );
}
