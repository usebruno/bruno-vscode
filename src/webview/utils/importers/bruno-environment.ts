import React from 'react';
import { BrunoError } from 'utils/common/error';
import { buildEnvVariable } from 'utils/environments';

const validateBrunoEnvironment = (env: any) => {
  if (!env || typeof env !== 'object') {
    throw new BrunoError('Invalid environment: expected an object');
  }

  if (!Array.isArray(env.variables)) {
    throw new BrunoError('Invalid environment: missing or invalid variables array');
  }

  env.variables.forEach((variable: any, index: any) => {
    if (!variable || typeof variable !== 'object') {
      throw new BrunoError(`Invalid variable at index ${index}: expected an object`);
    }
    if (!variable.name || typeof variable.name !== 'string') {
      throw new BrunoError(`Invalid variable at index ${index}: missing or invalid name`);
    }
  });

  return {
    name: env.name || 'Imported Environment',
    variables: env.variables.map((envVariable: any) => buildEnvVariable({ envVariable, withUuid: true }))
  };
};

const processEnvironmentData = (data: any, fileName: any) => {
  try {
    if (data.info && data.info.type === 'bruno-environment' && Array.isArray(data.environments)) {
      return data.environments.map((env: any, index: any) => {
        try {
          return validateBrunoEnvironment(env);
        } catch (err) {
          throw new BrunoError(`Error in environment ${index + 1} from ${fileName}: ${err.message}`);
        }
      });
    }

    if (Array.isArray(data)) {
      return data.map((env, index) => {
        try {
          return validateBrunoEnvironment(env);
        } catch (err) {
          throw new BrunoError(`Error in environment ${index + 1} from ${fileName}: ${err.message}`);
        }
      });
    }

    return [validateBrunoEnvironment(data)];
  } catch (err) {
    throw new BrunoError(`Error processing ${fileName}: ${err.message}`);
  }
};

const processFiles = (parsedFiles: any) => {
  const allEnvironments = [];

  for (const parsedFile of parsedFiles) {
    try {
      const environments = processEnvironmentData(parsedFile.content, parsedFile.fileName);
      allEnvironments.push(...environments);
    } catch (err) {
      throw new BrunoError(`Failed to process ${parsedFile.fileName}: ${err.message}`);
    }
  }

  return allEnvironments;
};

const importBrunoEnvironment = (parsedFiles: any) => {
  try {
    if (!parsedFiles || parsedFiles.length === 0) {
      throw new BrunoError('No files provided');
    }

    const environments = processFiles(parsedFiles);
    return environments;
  } catch (err) {
    console.error(err);
    throw err instanceof BrunoError ? err : new BrunoError('Import Bruno environment failed');
  }
};

export { importBrunoEnvironment, processEnvironmentData };
export default importBrunoEnvironment;
