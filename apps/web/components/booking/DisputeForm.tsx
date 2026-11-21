'use client';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { DisputeCategory, OpenDisputeInput, type DisputeOutput } from '@waka/contracts';
import type { z } from 'zod';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Select, Textarea, describedBy } from '@/components/ui/Field';
import { ErrorState, Notice } from '@/components/ui/States';

type Form = z.infer<typeof OpenDisputeInput>;
const SAFETY: Form['category'][] = ['DANGEROUS_BEHAVIOUR', 'THEFT_ASSAULT_HARASSMENT', 'ACCIDENT'];

/** Ouverture d’un litige — validé avec le schéma Zod partagé `OpenDisputeInput`. */
export function DisputeForm({ bookingId, onOpened }: { bookingId: string; onOpened: (d: DisputeOutput) => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const { register, handleSubmit, formState, watch } = useForm<Form>({
    resolver: zodResolver(OpenDisputeInput),
    defaultValues: { category: 'DRIVER_NO_SHOW', description: '', requestedOutcome: 'FULL_REFUND', urgentSafety: false },
  });
  const category = watch('category');
  const urgent = watch('urgentSafety');
  const e = formState.errors;

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      onOpened(await api.bookings.dispute(bookingId, v));
    } catch (err) {
      setError(err);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <p className="text-sm leading-relaxed text-ink">{t.dispute.newSubtitle}</p>
      {(urgent || SAFETY.includes(category)) && (
        <Notice tone="night" icon={<ShieldAlert className="h-5 w-5 text-amber-400" aria-hidden="true" />}>
          <p className="font-bold">{t.dispute.safetyTitle}</p>
          <p className="mt-1 text-night-200">{t.dispute.safetyBody}</p>
        </Notice>
      )}
      <Field id="d-cat" label={t.dispute.category} error={e.category?.message}>
        <Select id="d-cat" {...register('category')}>
          {DisputeCategory.options.map((c) => (
            <option key={c} value={c}>
              {t.dispute.categories[c]}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="d-desc" label={t.dispute.description} hint={t.dispute.descriptionHint} error={e.description ? t.dispute.descriptionHint : undefined}>
        <Textarea
          id="d-desc"
          rows={5}
          aria-invalid={e.description ? true : undefined}
          aria-describedby={describedBy('d-desc', e.description, true)}
          {...register('description')}
        />
      </Field>
      <Field id="d-out" label={t.dispute.outcome}>
        <Select id="d-out" {...register('requestedOutcome')}>
          {(['FULL_REFUND', 'PARTIAL_REFUND', 'RELEASE', 'OTHER'] as const).map((o) => (
            <option key={o} value={o}>
              {t.dispute.outcomes[o]}
            </option>
          ))}
        </Select>
      </Field>
      <div className="rounded-2xl bg-danger-50 p-3 ring-1 ring-danger-100">
        <Checkbox id="d-urgent" label={<span className="font-semibold text-night-900">{t.dispute.urgent}</span>} {...register('urgentSafety')} />
        <p className="ml-9 text-xs text-ink">{t.dispute.urgentHint}</p>
      </div>
      <p className="text-xs text-ink">{t.dispute.notArbitrary}</p>
      {error ? <ErrorState compact error={error} /> : null}
      <Button type="submit" className="w-full" size="lg" loading={formState.isSubmitting}>
        {formState.isSubmitting ? t.dispute.submitting : t.dispute.submit}
      </Button>
    </form>
  );
}
