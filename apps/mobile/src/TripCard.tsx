import { Pressable, Text, View } from 'react-native';
import type { TripSummary } from './api';
import { addMinutes, dateKey, dayShort, duration, initials, money, seats, time } from './format';
import { useI18n } from './i18n';
import { Shield } from './icons';
import { c, f, leaf, shadow } from './theme';
import { Avatar, DottedLine, Pill, T } from './ui';

export function TripCard({ trip, onPress, showDate }: { trip: TripSummary; onPress: () => void; showDate?: boolean }) {
  const { t } = useI18n();
  const arrival = trip.estimatedDurationMin ? time(addMinutes(trip.departureAt, trip.estimatedDurationMin)) : '--:--';
  const full = trip.seatsAvailable === 0 || trip.status === 'FULL';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${t.trip.departure} ${time(trip.departureAt)}, ${trip.driver.displayName}, ${money(trip.totalPerSeat)}`}
      onPress={onPress}
      style={[leaf, shadow, { gap: 12, paddingVertical: 16, paddingHorizontal: 18, backgroundColor: c.white }]}
    >
      {showDate ? <T style={{ fontSize: 13, fontFamily: f.bold, color: c.forestSoft }}>{dayShort(dateKey(trip.departureAt))}</T> : null}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Text style={{ fontFamily: f.display, fontSize: 20, color: c.ink }}>{time(trip.departureAt)}</Text>
        <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <View style={{ width: 10, height: 10, borderRadius: 5, borderWidth: 2.5, borderColor: c.leaf }} />
          <View style={{ flex: 1, height: 2, backgroundColor: c.lineStrong }} />
          <T style={{ fontSize: 12, fontFamily: f.bold, color: c.forestSoft }}>{duration(trip.estimatedDurationMin)}</T>
          <View style={{ flex: 1, height: 2, backgroundColor: c.lineStrong }} />
          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: c.leaf }} />
        </View>
        <Text style={{ fontFamily: f.display, fontSize: 20, color: c.muted }}>{arrival}</Text>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
        <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily: f.semi }}>{trip.meetingPoint}</T>
        <T numberOfLines={1} style={{ flexShrink: 1, fontSize: 14, fontFamily: f.semi }}>{trip.dropoffPoint}</T>
      </View>
      <DottedLine />
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
        <Avatar text={initials(trip.driver.displayName)} />
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <T numberOfLines={1} style={{ flexShrink: 1, fontFamily: f.bold, fontSize: 14 }}>{trip.driver.displayName}</T>
            {trip.driver.verified ? <Shield size={15} color={c.leaf} stroke={2.4} /> : null}
          </View>
          <T numberOfLines={1} style={{ fontSize: 13, color: c.muted }}>{`${full ? t.search.full : seats(trip.seatsAvailable)} · ${trip.vehicle.label}`}</T>
        </View>
        {full ? (
          <Pill label={t.search.full} tone="danger" />
        ) : (
          <View style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, backgroundColor: c.forest }}>
            <Text style={{ fontFamily: f.display, fontSize: 14, color: c.white }}>{money(trip.totalPerSeat)}</Text>
          </View>
        )}
      </View>
    </Pressable>
  );
}
