import { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleProp, Text, TextStyle } from "react-native";

interface Props {
  value: number;
  style?: StyleProp<TextStyle>;
  suffix?: string;
  duration?: number;
}

/** Nombre qui compte — Animated.Value + listener sur state texte. */
export default function AnimatedNumber({ value, style, suffix = "", duration = 700 }: Props) {
  const anim = useRef(new Animated.Value(value)).current;
  const [display, setDisplay] = useState(value);
  const mounted = useRef(false);

  useEffect(() => {
    const id = anim.addListener(({ value: v }) => setDisplay(Math.round(v)));
    return () => anim.removeListener(id);
  }, [anim]);

  useEffect(() => {
    if (!mounted.current) {
      mounted.current = true;
      anim.setValue(value);
      setDisplay(value);
      return;
    }
    Animated.timing(anim, {
      toValue: value,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [value, duration, anim]);

  return (
    <Text style={style}>
      {display}
      {suffix}
    </Text>
  );
}
