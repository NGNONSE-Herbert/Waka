'use client';

import { SessionProvider } from '@/components/session';
import { ConsoleShell } from '@/components/shell';

export default function ConsoleLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ConsoleShell>{children}</ConsoleShell>
    </SessionProvider>
  );
}
