import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';
import { api, type DriverTrip, errorMessage, type Me } from '../../src/api';
import { dateKey, dayShort, money, seats, time } from '../../src/format';
import { fmt, useI18n } from '../../src/i18n';
import { Car, Check, Chevron, Doc, Hourglass, Plus, Shield, TicketCanopy, Wallet } from '../../src/icons';
import { useSession } from '../../src/session';
import { c, f, leaf, leafAlt } from '../../src/theme';
import { EmptyState, ErrorBox, GhostButton, H, LimeButton, Notice, Pill, PrimaryButton, RequireAuth, Screen, SectionTitle, T } from '../../src/ui';

function VehicleList({ me }: { me: Me }) {
  const { t } = useI18n();
  return (
    <>
      {me.vehicles.map((v) => (
        <View key={v.id} style={[leafAlt, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: c.white }]}>
          <View style={{ width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', backgroundColor: c.sage }}>
            <Car size={20} color={c.forest} />
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <T numberOfLines={2} style={{ fontSize: 14, fontFamily: f.bold }}>{v.label}</T>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <T style={{ fontSize: 12, color: c.muted }}>{seats(v.seatsTotal)}</T>
              <Pill label={t.driver.vehicleStatus[v.reviewStatus]} tone={v.reviewStatus === 'APPROVED' ? 'dark' : v.reviewStatus === 'REJECTED' ? 'danger' : 'lime'} />
            </View>
          </View>
        </View>
      ))}
    </>
  );
}

function Onboarding({ me }: { me: Me }) {
  const router = useRouter();
  const { t, m } = useI18n();
  const { refresh } = useSession();
  const rejected = me.driverStatus === 'REJECTED';
  const identityDone = me.driverStatus === 'PENDING_REVIEW';
  const vehicleDone = me.vehicles.length > 0;
  const step = !identityDone ? 0 : !vehicleDone ? 1 : 2;
  const steps = [
    { label: t.driver.stepIdentity, Icon: Doc },
    { label: t.driver.stepVehicle, Icon: Car },
    { label: t.driver.stepReview, Icon: Hourglass },
  ];

  return (
    <Screen tabbed onRefresh={refresh}>
      <H style={{ fontSize: 32, lineHeight: 34 }}>{t.driver.onboardingTitle}</H>
      <T style={{ color: c.muted }}>{t.driver.onboardingSubtitle}</T>

      <View accessibilityLabel={steps[step]?.label} style={{ flexDirection: 'row', gap: 8 }}>
        {steps.map(({ label, Icon }, i) => {
          const done = i < step;
          const current = i === step;
          return (
            <View key={label} style={{ flex: 1, gap: 8, padding: 12, borderRadius: 20, backgroundColor: current ? c.lime : done ? c.forest : c.white }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center', backgroundColor: done ? c.forestSoft : current ? c.white : c.sage }}>
                {done ? <Check size={16} color={c.lime} /> : <Icon size={17} color={c.forest} />}
              </View>
              <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 13, fontFamily: f.bold, color: done ? c.white : c.ink }}>{label}</T>
            </View>
          );
        })}
      </View>

      {rejected ? <EmptyState title={t.driver.rejectedTitle} body={t.driver.rejectedBody} /> : null}
      {step === 0 ? <PrimaryButton label={rejected ? t.driver.submitIdentity : m.hubContinue} onPress={() => router.push('/conducteur/dossier')} /> : null}
      {step === 1 ? <PrimaryButton label={m.hubAddVehicle} onPress={() => router.push('/conducteur/vehicule')} /> : null}
      {step === 2 ? (
        <>
          <View style={[leaf, { gap: 8, padding: 20, backgroundColor: c.white }]}>
            <Hourglass size={28} color={c.leaf} />
            <H style={{ fontSize: 20 }}>{t.driver.reviewTitle}</H>
            <T style={{ fontSize: 14, color: c.muted }}>{t.driver.reviewBody}</T>
          </View>
          <VehicleList me={me} />
        </>
      ) : null}
    </Screen>
  );
}

function Dashboard({ me }: { me: Me }) {
  const router = useRouter();
  const { t } = useI18n();
  const { refresh } = useSession();
  const [trips, setTrips] = useState<DriverTrip[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const list = await api.myTrips();
      setTrips([...list].sort((a, b) => b.departureAt.localeCompare(a.departureAt)));
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const publish = () => router.push('/conducteur/publier');

  return (
    <Screen
      tabbed
      onRefresh={async () => {
        await Promise.all([load(), refresh()]);
      }}
    >
      <View style={{ overflow: 'hidden', gap: 12, padding: 22, borderTopLeftRadius: 48, borderTopRightRadius: 14, borderBottomRightRadius: 48, borderBottomLeftRadius: 14, backgroundColor: c.forest }}>
        <TicketCanopy />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Shield size={16} color={c.lime} />
          <T style={{ fontSize: 13, fontFamily: f.bold, color: c.lime }}>{t.account.driverStatus.VERIFIED}</T>
        </View>
        <Text style={{ fontFamily: f.display, fontSize: 30, lineHeight: 32, letterSpacing: -0.8, color: c.white }}>{fmt(t.driver.dashboardTitle, { name: me.displayName })}</Text>
        <T style={{ fontSize: 14, color: c.onDark }}>{t.driver.dashboardSubtitle}</T>
        <LimeButton label={t.driver.publishCta} icon={<Plus size={18} />} onPress={publish} />
      </View>

      {!me.canPublishTrips ? <Notice tone="lime">{t.driver.noApprovedVehicle}</Notice> : null}

      <GhostButton label={t.driver.earningsCta} icon={<Wallet size={18} />} onPress={() => router.push('/conducteur/revenus')} />

      <SectionTitle>{t.driver.myTrips}</SectionTitle>
      {error ? <ErrorBox message={error} onRetry={load} /> : null}
      {!trips && !error ? <ActivityIndicator color={c.leaf} size="large" accessibilityLabel={t.common.loading} /> : null}
      {trips?.length === 0 ? <EmptyState title={t.driver.noTrips} body={t.driver.noTripsBody} /> : null}
      {trips?.map((trip) => (
        <Pressable
          key={trip.id}
          accessibilityRole="button"
          onPress={() => router.push({ pathname: '/conducteur/trajet/[id]', params: { id: trip.id } })}
          style={[leaf, { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: c.white }]}
        >
          <View style={{ width: 66, alignItems: 'center', paddingVertical: 8, borderRadius: 16, backgroundColor: c.sage }}>
            <T numberOfLines={1} adjustsFontSizeToFit style={{ fontSize: 11, fontFamily: f.bold, color: c.forestSoft }}>{dayShort(dateKey(trip.departureAt))}</T>
            <Text style={{ fontFamily: f.display, fontSize: 16, color: c.ink }}>{time(trip.departureAt)}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <H numberOfLines={1} style={{ fontSize: 16, letterSpacing: -0.3 }}>{`${trip.origin.name} → ${trip.destination.name}`}</H>
            <T numberOfLines={1} style={{ fontSize: 12, color: c.muted }}>{`${money(trip.seatPrice)} · ${trip.seatsTotal - trip.seatsAvailable}/${seats(trip.seatsTotal)}`}</T>
            <Pill label={t.trip.status[trip.status]} tone={trip.status === 'CANCELLED' ? 'danger' : trip.status === 'PUBLISHED' ? 'dark' : 'sage'} />
          </View>
          <Chevron size={18} color={c.forest} />
        </Pressable>
      ))}

      <SectionTitle>{t.trip.vehicle}</SectionTitle>
      <VehicleList me={me} />
      <GhostButton label={t.driver.addVehicle} icon={<Plus size={18} />} onPress={() => router.push('/conducteur/vehicule')} />
      <Notice>{t.driver.arrivalBody}</Notice>
    </Screen>
  );
}

function Hub({ me }: { me: Me }) {
  const { t } = useI18n();
  const { refresh } = useSession();
  useFocusEffect(
    useCallback(() => {
      void refresh();
    }, [refresh]),
  );
  if (me.driverStatus === 'VERIFIED') return <Dashboard me={me} />;
  if (me.driverStatus === 'SUSPENDED') {
    return (
      <Screen tabbed>
        <H style={{ fontSize: 30 }}>{t.driver.title}</H>
        <EmptyState title={t.driver.suspendedTitle} body={t.driver.suspendedBody} />
      </Screen>
    );
  }
  return <Onboarding me={me} />;
}

export default function Publish() {
  const { t, m } = useI18n();
  return <RequireAuth tabbed title={t.driver.publishTitle} body={m.signInDriver}>{(me) => <Hub me={me} />}</RequireAuth>;
}
