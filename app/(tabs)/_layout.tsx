import { Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useThemeColors, fonts } from "../../src/theme";

type IconName = keyof typeof Ionicons.glyphMap;

function tabIcon(filled: IconName, outline: IconName) {
  return function TabIcon({
    color,
    size,
    focused,
  }: {
    color: string;
    size: number;
    focused: boolean;
  }) {
    return (
      <Ionicons
        name={focused ? filled : outline}
        size={focused ? size + 2 : size}
        color={color}
      />
    );
  };
}

export default function TabLayout() {
  const c = useThemeColors();

  return (
    <Tabs
      screenOptions={{
        // Les 4 onglets restent montés → switch instantané, zéro reload visible
        lazy: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.textTertiary,
        headerShown: false,
        tabBarStyle: {
          backgroundColor: c.tabBar,
          borderTopColor: c.tabBarBorder,
          borderTopWidth: 0.5,
        },
        tabBarLabelStyle: {
          fontSize: fonts.sizes.xs,
          fontWeight: fonts.weights.medium,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Carte",
          tabBarLabel: "Carte",
          // Pas de freezeOnBlur sur la carte (Mapbox) — prudence
          tabBarIcon: tabIcon("map", "map-outline"),
        }}
      />
      <Tabs.Screen
        name="discover"
        options={{
          title: "Découvrir",
          tabBarLabel: "Découvrir",
          freezeOnBlur: true,
          tabBarIcon: tabIcon("compass", "compass-outline"),
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          title: "Historique",
          tabBarLabel: "Historique",
          freezeOnBlur: true,
          tabBarIcon: tabIcon("time", "time-outline"),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: "Profil",
          tabBarLabel: "Profil",
          freezeOnBlur: true,
          tabBarIcon: tabIcon("person", "person-outline"),
        }}
      />
    </Tabs>
  );
}
