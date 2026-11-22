import { BricolageGrotesque_700Bold, BricolageGrotesque_800ExtraBold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, Figtree_700Bold } from '@expo-google-fonts/figtree';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { I18nProvider } from '../src/i18n';
import { SessionProvider } from '../src/session';
import { c } from '../src/theme';

export default function RootLayout() {
  const [loaded, error] = useFonts({
    BricolageGrotesque_700Bold,
    BricolageGrotesque_800ExtraBold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
    Figtree_700Bold,
  });

  return (
    <SafeAreaProvider>
      <StatusBar style="dark" />
      {loaded || error ? (
        <I18nProvider>
          <SessionProvider>
            <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.bg }, animation: 'slide_from_right' }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="connexion" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
            </Stack>
          </SessionProvider>
        </I18nProvider>
      ) : (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: c.bg }}>
          <ActivityIndicator size="large" color={c.leaf} />
        </View>
      )}
    </SafeAreaProvider>
  );
}
