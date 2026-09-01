import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Router } from "../../../router";
import { NavLink } from "./nav-link";

export function AdminLayout({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-screen">
      <header className="flex items-center gap-2 border-b border-border px-4 py-2">
        <span className="mr-4 font-bold text-lg">{t("app.name")}</span>
        <NavLink to={Router.Home()}>{t("nav.dashboard")}</NavLink>
        <NavLink to={Router.Settings()}>{t("nav.settings")}</NavLink>
      </header>
      <main className="mx-auto max-w-6xl p-4">{children}</main>
    </div>
  );
}
