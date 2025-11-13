const { getDefaultConfig } = require("expo/metro-config");

module.exports = (async () => {
  const config = await getDefaultConfig(__dirname);

  // Keep your current asset extension config
  const { assetExts } = config.resolver;

  // 👇 Add `.bin` and ignore .babelrc inside node_modules
  return {
    ...config,
    resolver: {
      ...config.resolver,
      assetExts: [...assetExts, "bin"],
      blacklistRE: /.*\/node_modules\/.*\/\.babelrc/, // <– Important fix
    },
    transformer: {
      ...config.transformer,
      babelTransformerPath: require.resolve("metro-react-native-babel-transformer"),
    },
  };
})();