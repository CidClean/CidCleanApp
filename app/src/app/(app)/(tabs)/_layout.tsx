import { Tabs } from 'expo-router';

import { BottomBar } from '@/components/BottomBar';

/** Barra inferior (D-337): Home, Leads, Accounts y Schedule; ya no hay Menú. La barra muestra solo los destinos permitidos. */
export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pipeline" />
      <Tabs.Screen name="accounts" />
      <Tabs.Screen name="schedule" />
    </Tabs>
  );
}
