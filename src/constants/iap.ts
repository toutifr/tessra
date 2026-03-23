import { Platform } from "react-native";

export const IAP_SKUS = Platform.select({
  ios: ["tessra_takeover_24h", "tessra_extend_24h"],
  android: ["tessra_takeover_24h", "tessra_extend_24h"],
  default: [],
}) as string[];
