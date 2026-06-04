import appJson from './app.json';

const DEFAULT_EAS_PROJECT_ID = 'ed8c7ea6-8264-48e1-99bf-7647d2b520d9';
const projectId = process.env.EXPO_PUBLIC_EAS_PROJECT_ID ?? process.env.EAS_PROJECT_ID ?? DEFAULT_EAS_PROJECT_ID;
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
