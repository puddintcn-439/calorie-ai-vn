const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	const aliasMap = {
		zustand: require.resolve('zustand', { paths: [__dirname] }),
		'zustand/vanilla': require.resolve('zustand/vanilla', { paths: [__dirname] }),
		'zustand/traditional': require.resolve('zustand/traditional', { paths: [__dirname] }),
		'zustand/middleware': require.resolve('zustand/middleware', { paths: [__dirname] }),
		'zustand/shallow': require.resolve('zustand/shallow', { paths: [__dirname] }),
	};

	const targetModule = aliasMap[moduleName] ?? moduleName;

	if (typeof defaultResolveRequest === 'function') {
		return defaultResolveRequest(context, targetModule, platform);
	}

	return context.resolveRequest(context, targetModule, platform);
};

module.exports = config;
