import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getLegal } from "@/lib/legal";
import { LegalPage } from "@/components/layout/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getLegal("securite", locale).title };
}

export default async function SafetyPage() {
  const { t, locale } = await getI18n();
  return (
    <LegalPage doc={getLegal("securite", locale)} t={t}>
    </LegalPage>
  );
}
