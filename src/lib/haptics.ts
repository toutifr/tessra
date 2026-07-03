import * as Haptics from "expo-haptics";

/** Feedback léger — tap, vote */
export function hapticLight(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
  } catch {
    // silencieux
  }
}

/** Feedback succès — publication, claim, achat */
export function hapticSuccess(): void {
  try {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
  } catch {
    // silencieux
  }
}

/** Feedback lourd — conquête */
export function hapticHeavy(): void {
  try {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy).catch(() => {});
  } catch {
    // silencieux
  }
}
