
import { forOwn, cloneDeep } from 'lodash';
const { interpolate } = require('@usebruno/common');

interface InterpolationOptions {
  globalEnvironmentVariables?: Record<string, string>;
  collectionVariables?: Record<string, string>;
  envVars?: Record<string, string>;
  folderVariables?: Record<string, string>;
  requestVariables?: Record<string, string>;
  runtimeVariables?: Record<string, string>;
  processEnvVars?: Record<string, string>;
  promptVariables?: Record<string, string>;
}

const interpolateString = (
  str: string,
  {
    globalEnvironmentVariables = {},
    collectionVariables = {},
    envVars = {},
    folderVariables = {},
    requestVariables = {},
    runtimeVariables = {},
    processEnvVars = {},
    promptVariables = {}
  }: InterpolationOptions
): string => {
  if (!str || !str.length || typeof str !== 'string') {
    return str;
  }

  // Clone envVars because we don't want to modify the original object
  const clonedEnvVars = cloneDeep(envVars);

  // envVars can in turn have values as {{process.env.VAR_NAME}}
  // so we need to interpolate envVars first with processEnvVars
  forOwn(clonedEnvVars, (value, key) => {
    clonedEnvVars[key] = interpolate(value, {
      process: {
        env: {
          ...processEnvVars
        }
      }
    });
  });

  // runtimeVariables take precedence over envVars
  const combinedVars: Record<string, unknown> = {
    ...globalEnvironmentVariables,
    ...collectionVariables,
    ...clonedEnvVars,
    ...folderVariables,
    ...requestVariables,
    ...runtimeVariables,
    ...promptVariables,
    process: {
      env: {
        ...processEnvVars
      }
    }
  };

  return interpolate(str, combinedVars);
};

export { interpolateString, InterpolationOptions };
