import { buildEnvVariable } from 'utils/environments';

export const exportBrunoEnvironment = async ({
  environments,
  environmentType,
  filePath,
  exportFormat = 'folder'
}: any) => {
  try {
    const { ipcRenderer } = window;

    let cleanEnvironments = environments.map((environment: any) => ({
      name: environment.name,
      variables: (environment.variables || []).map((envVariable: any) => buildEnvVariable({ envVariable }))
    }));

    await ipcRenderer.invoke('renderer:export-environment', {
      environments: cleanEnvironments,
      environmentType,
      format: 'json',
      filePath,
      exportFormat
    });
  } catch (error) {
    console.error(`Error exporting ${environmentType} environment as .json:`, error);
    throw new Error(`Failed to export ${environmentType} environments.`);
  }
};
