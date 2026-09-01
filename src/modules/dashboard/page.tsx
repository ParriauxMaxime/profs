import { useTranslation } from "react-i18next";

export function DashboardPage() {
  const { t } = useTranslation();
  return <p className="text-text-muted">{t("app.tagline")}</p>;
}
