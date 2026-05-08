export default {
  expo: {
    name: "Tessra",
    slug: "tessra",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    scheme: "tessra",
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.tessra.app",
      infoPlist: {
        NSLocationWhenInUseUsageDescription:
          "Tessra utilise votre position pour vous montrer les carrés autour de vous.",
        NSCameraUsageDescription:
          "Tessra a besoin de votre caméra pour publier des images.",
        NSPhotoLibraryUsageDescription:
          "Tessra a besoin d'accéder à vos photos pour publier des images.",
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
      package: "com.tessra.app",
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
