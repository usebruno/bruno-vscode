import React from 'react';
import { BrunoError } from 'utils/common/error';
// @ts-expect-error - @usebruno/converters types may not include this export
import { postmanToBrunoEnvironment } from '@usebruno/converters';

const importEnvironment = async (parsedFiles: any) => {
  try {
    const environments = [];

    for (const parsedFile of parsedFiles) {
      try {
        const environment = postmanToBrunoEnvironment(parsedFile.content);
        environments.push(environment);
      } catch (err) {
        console.error(`Error processing file: ${parsedFile.fileName}`, err);
        throw new BrunoError(`Failed to process ${parsedFile.fileName}: ${err.message}`);
      }
    }

    return environments;
  } catch (err) {
    throw err instanceof BrunoError ? err : new BrunoError('Import Environment failed');
  }
};

export default importEnvironment;
