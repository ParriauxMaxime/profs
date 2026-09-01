import { Link } from "@swan-io/chicane";
import type { ReactNode } from "react";

export function NavLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="rounded px-3 py-2 font-medium text-text-muted hover:bg-bg-hover hover:text-text"
      activeClassName="bg-bg-hover text-text"
    >
      {children}
    </Link>
  );
}
