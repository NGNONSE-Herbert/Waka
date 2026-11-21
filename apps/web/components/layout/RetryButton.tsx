'use client';
import { RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/Button';

export function RetryButton({ label }: { label: string }) {
  return (
    <Button className="mt-8" onClick={() => window.location.reload()}>
      <RefreshCw className="h-4 w-4" aria-hidden="true" />
      {label}
    </Button>
  );
}
