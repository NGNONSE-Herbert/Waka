import { Tabs, useSegments } from 'expo-router';
import { PillBar } from '../../src/PillBar';
import { c } from '../../src/theme';

function ActiveBar() {
  const segments = useSegments() as string[];
  return <PillBar active={segments[1] ?? 'index'} />;
}

export default function TabsLayout() {
  return (
    <Tabs tabBar={() => <ActiveBar />} screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: c.bg } }}>
      <Tabs.Screen name="index" />
      <Tabs.Screen name="trajets" />
      <Tabs.Screen name="publier" />
      <Tabs.Screen name="compte" />
    </Tabs>
  );
}
