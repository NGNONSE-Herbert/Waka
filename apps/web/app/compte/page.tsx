import type { Metadata } from 'next';
import { getI18n } from '@/lib/i18n/server';
import { AccountView } from '@/components/session/AccountView';

export async function generateMetadata(): Promise<Metadata> {
  const { t } = await getI18n();
  return { title: t.account.title, robots: { index: false } };
}

export default function AccountPage() {
  return <AccountView />;
}
