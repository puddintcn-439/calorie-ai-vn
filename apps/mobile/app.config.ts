import appJson from './app.json';

const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID;
const baseExpoConfig = appJson.expo as typeof appJson.expo & {
  extra?: {
    eas?: {
      projectId?: string;
    };
    [key: string]: unknown;
  };
};

const config = {
  ...baseExpoConfig,
  extra: {
    ...(baseExpoConfig.extra ?? {}),
    eas: {
      ...(baseExpoConfig.extra?.eas ?? {}),
      ...(projectId ? { projectId } : {}),
    },
  },
};

export default {
  expo: config,
};