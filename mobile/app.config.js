// app.config.js instead of app.json so the Google Maps API key (a real,
// billing-capable credential) can be read from .env at config-evaluation
// time rather than sitting hardcoded in a plaintext config file. Expo's CLI
// auto-loads .env before evaluating this file for local commands (expo
// start, expo prebuild) - no dotenv require needed. EAS Build's cloud
// environment does NOT read local .env files though - GOOGLE_MAPS_API_KEY
// needs to be registered separately via `eas env:create` before the next
// cloud build that includes react-native-maps.
module.exports = {
  expo: {
    name: "mobile",
    slug: "mobile",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.disasteraidsystem.mobile",
      config: {
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
      },
    },
    android: {
      package: "com.disasteraidsystem.mobile",
      googleServicesFile: "./google-services.json",
      adaptiveIcon: {
        backgroundColor: "#E6F4FE",
        foregroundImage: "./assets/android-icon-foreground.png",
        backgroundImage: "./assets/android-icon-background.png",
        monochromeImage: "./assets/android-icon-monochrome.png",
      },
      predictiveBackGestureEnabled: false,
      permissions: [
        "android.permission.CAMERA",
        "android.permission.RECORD_AUDIO",
        "android.permission.ACCESS_COARSE_LOCATION",
        "android.permission.ACCESS_FINE_LOCATION",
      ],
      config: {
        googleMaps: {
          apiKey: process.env.GOOGLE_MAPS_API_KEY,
        },
      },
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission: "Allow $(PRODUCT_NAME) to use the camera to scan delivery confirmation QR codes.",
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "Allow $(PRODUCT_NAME) to use your location so your aid request can be routed to the right area.",
        },
      ],
      "expo-localization",
      [
        "expo-notifications",
        {
          color: "#ea580c",
        },
      ],
    ],
    extra: {
      eas: {
        projectId: "f0c9530f-9860-44a1-8ef4-ff33e80c958e",
      },
    },
  },
};
