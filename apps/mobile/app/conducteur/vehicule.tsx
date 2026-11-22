import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { api, errorMessage } from '../../src/api';
import { dateKey, parseDate } from '../../src/format';
import { useI18n } from '../../src/i18n';
import { useSession } from '../../src/session';
import { DateField, ErrorBox, Field, Notice, PageHeader, PrimaryButton, RequireAuth, Screen } from '../../src/ui';

function Form() {
  const router = useRouter();
  const { t, m } = useI18n();
  const { refresh } = useSession();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [plate, setPlate] = useState('');
  const [year, setYear] = useState('2015');
  const [seats, setSeats] = useState('4');
  const [insurance, setInsurance] = useState('');
  const [inspection, setInspection] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const yearN = Number(year);
  const seatsN = Number(seats);
  const insuranceKey = parseDate(insurance);
  const inspectionKey = parseDate(inspection);
  const dateError = (key: string | null) => (!key ? m.dateInvalid : key < dateKey() ? m.datePast : null);
  const errors = {
    make: make.trim().length < 2 ? t.common.invalidField : null,
    model: model.trim().length < 1 ? t.common.invalidField : null,
    color: color.trim().length < 3 ? t.common.invalidField : null,
    plate: plate.replace(/[^a-zA-Z0-9]/g, '').length < 5 ? t.common.invalidField : null,
    year: !Number.isInteger(yearN) || yearN < 1995 || yearN > 2027 ? m.yearInvalid : null,
    seats: !Number.isInteger(seatsN) || seatsN < 2 || seatsN > 8 ? m.seatsInvalid : null,
    insurance: dateError(insuranceKey),
    inspection: dateError(inspectionKey),
  };
  const show = (e: string | null) => (attempted ? e : null);

  const submit = async () => {
    setAttempted(true);
    if (Object.values(errors).some(Boolean) || !insuranceKey || !inspectionKey) return;
    setBusy(true);
    setError(null);
    try {
      await api.addVehicle({ make: make.trim(), model: model.trim(), color: color.trim(), plate: plate.trim(), year: yearN, seatsTotal: seatsN, insuranceExpiry: insuranceKey, inspectionExpiry: inspectionKey });
      await refresh();
      if (router.canGoBack()) router.back();
      else router.replace('/publier');
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const half = { flex: 1 };
  return (
    <Screen footer={<PrimaryButton label={t.driver.submitVehicle} busy={busy} onPress={submit} />}>
      <PageHeader title={t.driver.vehicleTitle} fallback="/publier" />
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={half}><Field label={t.driver.make} value={make} onChangeText={setMake} placeholder="Toyota" autoCapitalize="words" maxLength={40} error={show(errors.make)} /></View>
        <View style={half}><Field label={t.driver.model} value={model} onChangeText={setModel} placeholder="Corolla" autoCapitalize="words" maxLength={40} error={show(errors.model)} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={half}><Field label={t.driver.color} value={color} onChangeText={setColor} autoCapitalize="sentences" maxLength={30} error={show(errors.color)} /></View>
        <View style={half}><Field label={t.driver.plate} value={plate} onChangeText={setPlate} placeholder="LT 123 AB" autoCapitalize="characters" maxLength={15} error={show(errors.plate)} /></View>
      </View>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <View style={half}><Field label={t.driver.year} value={year} onChangeText={(v) => setYear(v.replace(/\D/g, '').slice(0, 4))} keyboardType="number-pad" error={show(errors.year)} /></View>
        <View style={half}><Field label={t.driver.seatsTotal} value={seats} onChangeText={(v) => setSeats(v.replace(/\D/g, '').slice(0, 1))} keyboardType="number-pad" error={show(errors.seats)} /></View>
      </View>
      <DateField label={t.driver.insuranceExpiry} value={insurance} onChange={setInsurance} error={show(errors.insurance)} />
      <DateField label={t.driver.inspectionExpiry} value={inspection} onChange={setInspection} error={show(errors.inspection)} />
      <Notice>{t.driver.idUploadNotice}</Notice>
      {error ? <ErrorBox message={error} /> : null}
    </Screen>
  );
}

export default function VehicleScreen() {
  const { t, m } = useI18n();
  return <RequireAuth title={t.driver.vehicleTitle} body={m.signInDriver}>{() => <Form />}</RequireAuth>;
}
