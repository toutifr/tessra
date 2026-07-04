import { Ionicons } from "@expo/vector-icons";
import { StyleProp, Text, TextStyle, View, ViewStyle } from "react-native";

/**
 * Rangée icône + libellé — remplace les emojis embarqués dans les strings
 * des boutons/labels. L'icône hérite de la couleur du texte.
 */
export default function IconLabel({
  icon,
  label,
  color,
  size = 15,
  gap = 6,
  textStyle,
  style,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  size?: number;
  gap?: number;
  textStyle?: StyleProp<TextStyle>;
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", justifyContent: "center", gap },
        style,
      ]}
    >
      <Ionicons name={icon} size={size} color={color} />
      <Text style={[textStyle, { color }]}>{label}</Text>
    </View>
  );
}
