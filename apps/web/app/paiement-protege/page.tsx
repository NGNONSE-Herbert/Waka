import type { Metadata } from "next";
import { getI18n } from "@/lib/i18n/server";
import { getLegal } from "@/lib/legal";
import { LegalPage } from "@/components/layout/LegalPage";
import { ProtectedTimeline } from "@/components/layout/ProtectedTimeline";

export async function generateMetadata(): Promise<Metadata> {
  const { locale } = await getI18n();
  return { title: getLegal("paiement-protege", locale).title };
}

export default async function ProtectedPaymentPage() {
  const { t, locale } = await getI18n();
  return (
    <LegalPage doc={getLegal("paiement-protege", locale)} t={t}>
      <ProtectedTimeline t={t} />
    </LegalPage>
  );
}
