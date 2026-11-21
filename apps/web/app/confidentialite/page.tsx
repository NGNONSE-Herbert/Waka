import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getLegal } from "@/lib/legal";
import { LegalPage } from "@/components/layout/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getLegal("confidentialite", locale).title };
}

export default async function PrivacyPage() {
  const { t, locale } = await getI18n();
  return (
    <LegalPage doc={getLegal("confidentialite", locale)} t={t}>
    </LegalPage>
  );
}
