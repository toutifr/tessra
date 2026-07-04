import { Tabs } from "expo-router";
import GameTabBar from "../../src/components/GameTabBar";

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <GameTabBar {...props} />}
      screenOptions={{
        // Les 4 onglets restent montés → switch instantané, zéro reload visible
        lazy: false,
        headerShown: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Map",
          // Pas de freezeOnBlur sur la carte (Mapbox) — prudence
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{ title: "Discover", freezeOnBlur: true }}
      />
      <Tabs.Screen
        name="history"
        options={{ title: "History", freezeOnBlur: true }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Profile", freezeOnBlur: true }}
      />
    </Tabs>
  );
}
