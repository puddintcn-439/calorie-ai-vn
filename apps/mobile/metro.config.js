const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
	const aliasMap = {
		zustand: 'zustand/index.js',
		'zustand/vanilla': 'zustand/vanilla.js',
		'zustand/traditional': 'zustand/traditional.js',
		'zustand/middleware': 'zustand/middleware.js',
		'zustand/shallow': 'zustand/shallow.js',
	};

	const targetModule = aliasMap[moduleName] ?? moduleName;

	if (typeof defaultResolveRequest === 'function') {
		return defaultResolveRequest(context, targetModule, platform);
	}

	return context.resolveRequest(context, targetModule, platform);
};

module.exports = config;
