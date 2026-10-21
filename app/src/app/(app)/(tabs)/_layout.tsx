import { Tabs } from 'expo-router';

import { BottomBar } from '@/components/BottomBar';

/** Barra inferior (D-132): Pipeline, Cuentas, Inicio y Menú; la barra muestra solo los destinos permitidos. */
export default function TabsLayout() {
  return (
    <Tabs
      backBehavior="initialRoute"
      tabBar={(props) => <BottomBar {...props} />}
      screenOptions={{ headerShown: false }}
    >
      {/* Inicio va primero en las rutas para abrir ahí; el orden visible lo da la barra (D-132). */}
      <Tabs.Screen name="index" />
      <Tabs.Screen name="pipeline" />
      <Tabs.Screen name="accounts" />
      <Tabs.Screen name="menu" />
    </Tabs>
  );
}
