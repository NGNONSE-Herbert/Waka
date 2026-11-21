'use client';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { FileCheck2, FlaskConical, UploadCloud } from 'lucide-react';
import { DriverOnboardingInput, VehicleInput } from '@waka/contracts';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n/client';
import { fmt } from '@/lib/i18n';
import { todayInDouala } from '@/lib/format';
import { Button } from '@/components/ui/Button';
import { Checkbox, Field, Input, Select, describedBy } from '@/components/ui/Field';
import { ErrorState, Notice } from '@/components/ui/States';

/** Étape identité + documents — validée avec `DriverOnboardingInput` (déclaration covoiturage privé obligatoire). */
export function OnboardingForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  const schema = DriverOnboardingInput.extend({
    declaresPrivateCarpoolOnly: z.boolean().refine((v) => v, t.driver.declarationRequired),
    idDocumentUploadRef: z.string().min(4, t.driver.idUploadMissing),
  });
  type Form = z.infer<typeof schema>;
  const { register, handleSubmit, formState, setValue, watch } = useForm<Form>({
    resolver: zodResolver(schema),
    defaultValues: { fullName: '', licenseNumber: '', licenseExpiry: '', idDocumentType: 'CNI', idDocumentUploadRef: '', declaresPrivateCarpoolOnly: false },
  });
  const e = formState.errors;
  const ref = watch('idDocumentUploadRef');
  const inv = t.common.invalidField;

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.driver.onboarding(DriverOnboardingInput.parse({ ...v, declaresPrivateCarpoolOnly: true }));
      onDone();
    } catch (err) {
      setError(err);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field id="ob-name" label={t.driver.fullName} error={e.fullName ? inv : undefined}>
        <Input id="ob-name" autoComplete="name" aria-invalid={e.fullName ? true : undefined} aria-describedby={describedBy('ob-name', e.fullName)} {...register('fullName')} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="ob-lic" label={t.driver.licenseNumber} error={e.licenseNumber ? inv : undefined}>
          <Input id="ob-lic" aria-invalid={e.licenseNumber ? true : undefined} aria-describedby={describedBy('ob-lic', e.licenseNumber)} {...register('licenseNumber')} />
        </Field>
        <Field id="ob-licexp" label={t.driver.licenseExpiry} error={e.licenseExpiry ? inv : undefined}>
          <Input id="ob-licexp" type="date" min={todayInDouala()} aria-invalid={e.licenseExpiry ? true : undefined} aria-describedby={describedBy('ob-licexp', e.licenseExpiry)} {...register('licenseExpiry')} />
        </Field>
      </div>
      <Field id="ob-idtype" label={t.driver.idType}>
        <Select id="ob-idtype" {...register('idDocumentType')}>
          {(['CNI', 'PASSPORT', 'RESIDENCE_PERMIT'] as const).map((k) => (
            <option key={k} value={k}>
              {t.driver.idTypes[k]}
            </option>
          ))}
        </Select>
      </Field>

      <div className="rounded-3xl border-2 border-dashed border-amber-300 bg-amber-50 p-5">
        <p className="flex items-center gap-2 font-semibold text-night-900">
          <UploadCloud className="h-5 w-5 text-amber-700" aria-hidden="true" />
          {t.driver.idUpload}
        </p>
        <p className="mt-1 flex items-start gap-2 text-sm text-amber-800">
          <FlaskConical className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {t.driver.idUploadNotice}
        </p>
        {ref ? (
          <p className="mt-3 flex items-center gap-2 text-sm font-semibold text-green-700" role="status">
            <FileCheck2 className="h-4 w-4" aria-hidden="true" />
            {fmt(t.driver.idUploadDone, { ref })}
          </p>
        ) : (
          <Button
            variant="secondary"
            size="sm"
            className="mt-3"
            onClick={() => setValue('idDocumentUploadRef', `demo-upload-${Math.random().toString(36).slice(2, 10)}`, { shouldValidate: true })}
          >
            {t.driver.idUploadDemo}
          </Button>
        )}
        {e.idDocumentUploadRef && (
          <p role="alert" className="mt-2 text-sm font-medium text-danger">
            {e.idDocumentUploadRef.message}
          </p>
        )}
      </div>

      <div className="rounded-3xl bg-sand p-4">
        <Checkbox id="ob-decl" label={t.driver.declaration} error={e.declaresPrivateCarpoolOnly?.message} {...register('declaresPrivateCarpoolOnly')} />
      </div>
      {error ? <ErrorState compact error={error} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        {t.driver.submitIdentity}
      </Button>
    </form>
  );
}

/** Formulaire véhicule — validé avec `VehicleInput`. */
export function VehicleForm({ onDone }: { onDone: () => void }) {
  const { t } = useI18n();
  const [error, setError] = useState<unknown>(null);
  type Form = z.infer<typeof VehicleInput>;
  const { register, handleSubmit, formState } = useForm<Form>({
    resolver: zodResolver(VehicleInput),
    defaultValues: { make: '', model: '', color: '', plate: '', year: 2015, seatsTotal: 4, insuranceExpiry: '', inspectionExpiry: '' },
  });
  const e = formState.errors;
  const inv = t.common.invalidField;
  const field = (id: keyof Form, label: string, props: Record<string, unknown> = {}, numeric = false) => (
    <Field id={`v-${id}`} label={label} error={e[id] ? inv : undefined}>
      <Input
        id={`v-${id}`}
        aria-invalid={e[id] ? true : undefined}
        aria-describedby={describedBy(`v-${id}`, e[id])}
        {...props}
        {...register(id, numeric ? { valueAsNumber: true } : {})}
      />
    </Field>
  );

  const submit = handleSubmit(async (v) => {
    setError(null);
    try {
      await api.driver.vehicle(v);
      onDone();
    } catch (err) {
      setError(err);
    }
  });

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        {field('make', t.driver.make, { placeholder: 'Toyota' })}
        {field('model', t.driver.model, { placeholder: 'Corolla' })}
        {field('color', t.driver.color)}
        {field('plate', t.driver.plate, { placeholder: 'LT 123 AB', className: 'uppercase' })}
        {field('year', t.driver.year, { type: 'number', inputMode: 'numeric', min: 1995, max: 2027 }, true)}
        {field('seatsTotal', t.driver.seatsTotal, { type: 'number', inputMode: 'numeric', min: 2, max: 8 }, true)}
        {field('insuranceExpiry', t.driver.insuranceExpiry, { type: 'date' })}
        {field('inspectionExpiry', t.driver.inspectionExpiry, { type: 'date' })}
      </div>
      <Notice tone="amber" icon={<FlaskConical className="h-4 w-4" aria-hidden="true" />}>
        {t.driver.idUploadNotice}
      </Notice>
      {error ? <ErrorState compact error={error} /> : null}
      <Button type="submit" size="lg" className="w-full" loading={formState.isSubmitting}>
        {t.driver.submitVehicle}
      </Button>
    </form>
  );
}
