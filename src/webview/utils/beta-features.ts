import { useSelector } from 'react-redux';

interface AppState {
  app: {
    preferences?: {
      beta?: Record<string, boolean>;
    };
  };
}

/**
 * Beta features configuration object
 * Contains all available beta feature keys
 */
export const BETA_FEATURES = Object.freeze({
  NODE_VM: 'nodevm'
});

/**
 * Hook to check if a beta feature is enabled
 * @param featureName - The name of the beta feature
 * @returns Whether the feature is enabled
 */
export const useBetaFeature = (featureName: string): boolean => {
  const preferences = useSelector((state: AppState) => state.app.preferences);
  return preferences?.beta?.[featureName] || false;
};
