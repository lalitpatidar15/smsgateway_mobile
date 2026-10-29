module.exports = {
  preset: '@react-native/jest-preset',
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native|@react-native-async-storage|@react-native-community|expo(nent)?|@expo|@expo-google-fonts|react-navigation|@react-navigation|@sentry|native-base|react-native-svg))',
  ],
};
