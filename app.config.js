export default {
  expo: {
    name: "Piri",
    slug: "tessra",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "piri",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.piri.app",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Piri uses your location to show the tiles around you.",
        NSCameraUsageDescription:
          "Piri needs your camera to publish photos.",
        NSPhotoLibraryUsageDescription:
          "Piri needs access to your photos to publish them.",
        ITSAppUsesNonExemptEncryption: false,
      },
      usesAppleSignIn: true,
    },
    android: {
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      package: "com.piri.app",
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
      ],
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    updates: {
      url: "https://u.expo.dev/e84d7473-636a-4b22-884e-d87220828c42",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    plugins: [
      "expo-router",
      "expo-secure-store",
      "expo-location",
      "expo-image-picker",
      "expo-notifications",
      [
        "@rnmapbox/maps",
        {
          RNMapboxMapsImpl: "mapbox",
          RNMapboxMapsDownloadToken:
            process.env.MAPBOX_DOWNLOAD_TOKEN ||
            process.env.RNMAPBOX_MAPS_DOWNLOAD_TOKEN ||
            "MISSING_TOKEN",
        },
      ],
      "expo-apple-authentication",
    ],
    extra: {
      router: {},
      eas: {
        projectId: "e84d7473-636a-4b22-884e-d87220828c42",
      },
    },
  },
};
