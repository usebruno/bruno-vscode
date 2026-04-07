import React from 'react';
// @ts-expect-error - httpsnippet types are incomplete, targets export not properly typed
import { targets } from 'httpsnippet';

interface Language {
  name: string;
  target: string;
  client: string;
}

interface HttpSnippetTarget {
  info: {
    key: string;
    title: string;
  };
  clientsById: Record<string, unknown>;
}

export const getLanguages = (): Language[] => {
  const allLanguages: Language[] = [];
  for (const target of Object.values(targets) as HttpSnippetTarget[]) {
    const { key, title } = target.info;
    const clients = Object.keys(target.clientsById);
    const languages
      = (clients.length === 1)
        ? [{
            name: title,
            target: key,
            client: clients[0]
          }]
        : clients.map((client) => ({
            name: `${title}-${client}`,
            target: key,
            client
          }));
    allLanguages.push(...languages);

    // Move "Shell-curl" to the top of the array
    const shellCurlIndex = allLanguages.findIndex((lang) => lang.name === 'Shell-curl');
    if (shellCurlIndex !== -1) {
      const [shellCurl] = allLanguages.splice(shellCurlIndex, 1);
      allLanguages.unshift(shellCurl);
    }
  }

  return allLanguages;
};
