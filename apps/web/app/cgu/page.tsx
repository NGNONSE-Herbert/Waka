import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getLegal } from "@/lib/legal";
import { LegalPage } from "@/components/layout/LegalPage";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getLegal("cgu", locale).title };
}

export default async function CguPage() {
  const { t, locale } = await getI18n();
  return (
    <LegalPage doc={getLegal("cgu", locale)} t={t}>
    </LegalPage>
  );
}
