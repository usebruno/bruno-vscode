import { useState, useMemo } from 'react';
import { browseFiles, updateBrunoConfig } from 'providers/ReduxStore/slices/collections/actions';
import { updateCollectionProtobuf } from 'providers/ReduxStore/slices/collections';
import { getRelativePath, getAbsoluteFilePath } from 'utils/common/path';
import { browseDirectory } from 'utils/filesystem';
import { loadGrpcMethodsFromProtoFile } from 'utils/network/index';
import useLocalStorage from 'hooks/useLocalStorage/index';
import { useAppDispatch } from 'providers/ReduxStore/hooks';
import { cloneDeep } from 'lodash';
import get from 'lodash/get';
import type { AppCollection, UID } from '@bruno-types';

interface ProtoFile {
  path: string;
  type?: string;
  exists?: boolean;
}

interface ImportPath {
  path: string;
  enabled?: boolean;
  exists?: boolean;
}

interface ProtobufConfig {
  protoFiles?: ProtoFile[];
  importPaths?: ImportPath[];
}

interface ProtoFileWithExistence {
  path: string;
  exists: boolean;
}

interface ImportPathWithExistence {
  path: string;
  exists: boolean;
  enabled: boolean;
}

interface GrpcMethod {
  [key: string]: unknown;
}

interface ProtofileCache {
  [path: string]: GrpcMethod[];
}

interface OperationResult {
  success: boolean;
  error?: Error | unknown;
  relativePath?: string;
  alreadyExists?: boolean;
  filePath?: string;
  directoryPath?: string;
  enabled?: boolean;
}

interface LoadMethodsResult {
  methods: GrpcMethod[];
  error: Error | null | unknown;
}

interface UseProtoFileManagementReturn {
  protoFiles: ProtoFileWithExistence[];
  importPaths: ImportPathWithExistence[];
  isLoadingMethods: boolean;
  loadMethodsFromProtoFile: (filePath: string, isManualRefresh?: boolean) => Promise<LoadMethodsResult>;
  addProtoFileToCollection: (filePath: string) => Promise<OperationResult>;
  addImportPathToCollection: (directoryPath: string) => Promise<OperationResult>;
  addImportPathFromRequest: (directoryPath: string) => Promise<OperationResult>;
  toggleImportPath: (index: number) => Promise<OperationResult>;
  toggleImportPathFromRequest: (index: number) => Promise<OperationResult>;
  browseForProtoFile: () => Promise<OperationResult>;
  browseForImportDirectory: () => Promise<OperationResult>;
  removeProtoFileFromCollection: (index: number) => Promise<OperationResult>;
  removeImportPathFromCollection: (index: number) => Promise<OperationResult>;
  replaceImportPathInCollection: (index: number, newDirectoryPath: string) => Promise<OperationResult>;
  replaceProtoFileInCollection: (index: number, newFilePath: string) => Promise<OperationResult>;
  addProtoFileFromRequest: (filePath: string) => Promise<OperationResult>;
}

/**
 * Custom hook for managing protofile data and collection configuration
 */
export default function useProtoFileManagement(collection: AppCollection): UseProtoFileManagementReturn {
  const dispatch = useAppDispatch();

  const [protofileCache, setProtofileCache] = useLocalStorage<ProtofileCache>('bruno.grpc.protofileCache', {});
  const [isLoadingMethods, setIsLoadingMethods] = useState(false);

  // Get protobuf config from draft if exists, otherwise from brunoConfig
  const protobufConfig: ProtobufConfig = collection?.draft?.brunoConfig
    ? get(collection, 'draft.brunoConfig.protobuf', {})
    : get(collection, 'brunoConfig.protobuf', {});

  const collectionProtoFiles = useMemo((): ProtoFile[] => protobufConfig?.protoFiles || [], [protobufConfig?.protoFiles]);
  const collectionImportPaths = useMemo((): ImportPath[] => protobufConfig?.importPaths || [], [protobufConfig?.importPaths]);

  const protoFilesWithExistence = useMemo((): ProtoFileWithExistence[] =>
    collectionProtoFiles.map((protoFile) => ({
      path: protoFile.path,
      exists: protoFile.exists || false
    })), [collectionProtoFiles]);

  const importPathsWithExistence = useMemo((): ImportPathWithExistence[] =>
    collectionImportPaths.map((importPath) => ({
      path: importPath.path,
      exists: importPath.exists || false,
      enabled: importPath.enabled || false
    })), [collectionImportPaths]);

  const loadMethodsFromProtoFile = async (filePath: string, isManualRefresh = false): Promise<LoadMethodsResult> => {
    if (!filePath) {
      return { methods: [], error: new Error('No proto file selected') };
    }

    const absolutePath = getAbsoluteFilePath(collection.pathname, filePath);

    const cachedMethods = protofileCache[absolutePath];
    if (cachedMethods && !isLoadingMethods && !isManualRefresh) {
      return { methods: cachedMethods, error: null as Error | null };
    }

    setIsLoadingMethods(true);
    try {
      const result = await loadGrpcMethodsFromProtoFile(absolutePath, collection) as { methods?: GrpcMethod[]; error?: Error | null };
      const methods = result.methods || [];
      const error = result.error;

      if (error) {
        console.error('Error loading gRPC methods:', error);
        return { methods: [] as GrpcMethod[], error };
      }

      setProtofileCache((prevCache) => ({
        ...prevCache,
        [absolutePath]: methods
      }));

      return { methods, error: null };
    } catch (err) {
      console.error('Error loading gRPC methods:', err);
      return { methods: [], error: err };
    } finally {
      setIsLoadingMethods(false);
    }
  };

  const addProtoFileToCollection = async (filePath: string): Promise<OperationResult> => {
    const relativePath = getRelativePath(collection.pathname, filePath, true);

    const exists = collectionProtoFiles.some((pf) => pf.path === relativePath);

    if (exists) {
      return { success: true, relativePath, alreadyExists: true };
    }

    try {
      const protoFileObj = {
        path: relativePath,
        type: 'file',
        exists: true
      };

      const updatedProtobuf = {
        ...protobufConfig,
        protoFiles: [...collectionProtoFiles, protoFileObj]
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true, relativePath };
    } catch (error) {
      console.error('Error adding proto file to collection:', error);
      return { success: false, error };
    }
  };

  const addProtoFileFromRequest = async (filePath: string): Promise<OperationResult> => {
    const relativePath = getRelativePath(collection.pathname, filePath, true);

    const exists = collectionProtoFiles.some((pf) => pf.path === relativePath);

    if (exists) {
      return { success: true, relativePath, alreadyExists: true };
    }

    try {
      const protoFileObj = {
        path: relativePath,
        type: 'file'
      };

      const brunoConfig = cloneDeep(collection.brunoConfig) as Record<string, unknown>;
      if (!brunoConfig.protobuf) {
        brunoConfig.protobuf = {};
      }
      const protobuf = brunoConfig.protobuf as ProtobufConfig;
      if (!protobuf.protoFiles) {
        protobuf.protoFiles = [];
      }

      protobuf.protoFiles = [...collectionProtoFiles, protoFileObj];

      await dispatch(updateBrunoConfig(brunoConfig, collection.uid));

      return { success: true, relativePath };
    } catch (error) {
      console.error('Error adding proto file to collection:', error);
      return { success: false, error };
    }
  };

  const addImportPathToCollection = async (directoryPath: string): Promise<OperationResult> => {
    const relativePath = getRelativePath(collection.pathname, directoryPath, true);
    const importPathObj: ImportPath = {
      path: relativePath,
      enabled: true,
      exists: true
    };

    const exists = collectionImportPaths.some((ip) => ip.path === importPathObj.path);

    if (exists) {
      return { success: false, error: new Error('Import path already exists') };
    }

    try {
      const updatedProtobuf = {
        ...protobufConfig,
        importPaths: [...collectionImportPaths, importPathObj]
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true, relativePath };
    } catch (error) {
      console.error('Error adding import path:', error);
      return { success: false, error };
    }
  };

  const addImportPathFromRequest = async (directoryPath: string): Promise<OperationResult> => {
    const relativePath = getRelativePath(collection.pathname, directoryPath, true);
    const importPathObj: ImportPath = {
      path: relativePath,
      enabled: true
    };

    const exists = collectionImportPaths.some((ip) => ip.path === importPathObj.path);

    if (exists) {
      return { success: false, error: new Error('Import path already exists') };
    }

    try {
      const brunoConfig = cloneDeep(collection.brunoConfig) as Record<string, unknown>;
      if (!brunoConfig.protobuf) {
        brunoConfig.protobuf = {};
      }
      const protobuf = brunoConfig.protobuf as ProtobufConfig;
      if (!protobuf.importPaths) {
        protobuf.importPaths = [];
      }

      protobuf.importPaths = [...collectionImportPaths, importPathObj];

      await dispatch(updateBrunoConfig(brunoConfig, collection.uid));

      return { success: true, relativePath };
    } catch (error) {
      console.error('Error adding import path:', error);
      return { success: false, error };
    }
  };

  const toggleImportPath = async (index: number): Promise<OperationResult> => {
    try {
      const updatedImportPaths = [...collectionImportPaths];
      updatedImportPaths[index] = {
        ...updatedImportPaths[index],
        enabled: !updatedImportPaths[index].enabled
      };

      const updatedProtobuf = {
        ...protobufConfig,
        importPaths: updatedImportPaths
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return {
        success: true,
        enabled: updatedImportPaths[index].enabled
      };
    } catch (error) {
      console.error('Error toggling import path:', error);
      return { success: false, error };
    }
  };

  const toggleImportPathFromRequest = async (index: number): Promise<OperationResult> => {
    try {
      const updatedImportPaths = [...collectionImportPaths];
      updatedImportPaths[index] = {
        ...updatedImportPaths[index],
        enabled: !updatedImportPaths[index].enabled
      };

      const brunoConfig = cloneDeep(collection.brunoConfig) as Record<string, unknown>;
      if (!brunoConfig.protobuf) {
        brunoConfig.protobuf = {};
      }
      (brunoConfig.protobuf as ProtobufConfig).importPaths = updatedImportPaths;

      await dispatch(updateBrunoConfig(brunoConfig, collection.uid));

      return {
        success: true,
        enabled: updatedImportPaths[index].enabled
      };
    } catch (error) {
      console.error('Error toggling import path:', error);
      return { success: false, error };
    }
  };

  const browseForProtoFile = async (): Promise<OperationResult> => {
    const filters = [{ name: 'Proto Files', extensions: ['proto'] }];

    try {
      const filePaths = await dispatch(browseFiles(filters, [''])) as string[];
      if (filePaths && filePaths.length > 0) {
        return { success: true, filePath: filePaths[0] };
      }
      return { success: false, error: new Error('No file selected') };
    } catch (error) {
      console.error('Error browsing for proto file:', error);
      return { success: false, error };
    }
  };

  const browseForImportDirectory = async (): Promise<OperationResult> => {
    try {
      const selectedPath = await browseDirectory(collection.pathname) as string | null;
      if (selectedPath) {
        return { success: true, directoryPath: selectedPath };
      }
      return { success: false, error: new Error('No directory selected') };
    } catch (error) {
      console.error('Error browsing for import directory:', error);
      return { success: false, error };
    }
  };

  const removeProtoFileFromCollection = async (index: number): Promise<OperationResult> => {
    try {
      const updatedProtoFiles = [...collectionProtoFiles];
      updatedProtoFiles.splice(index, 1);

      const updatedProtobuf = {
        ...protobufConfig,
        protoFiles: updatedProtoFiles
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true };
    } catch (error) {
      console.error('Error removing proto file:', error);
      return { success: false, error };
    }
  };

  const removeImportPathFromCollection = async (index: number): Promise<OperationResult> => {
    try {
      const updatedImportPaths = [...collectionImportPaths];
      updatedImportPaths.splice(index, 1);

      const updatedProtobuf = {
        ...protobufConfig,
        importPaths: updatedImportPaths
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true };
    } catch (error) {
      console.error('Error removing import path:', error);
      return { success: false, error };
    }
  };

  const replaceImportPathInCollection = async (index: number, newDirectoryPath: string): Promise<OperationResult> => {
    try {
      const relativePath = getRelativePath(collection.pathname, newDirectoryPath, true);
      const updatedImportPaths = [...collectionImportPaths];
      updatedImportPaths[index] = {
        ...updatedImportPaths[index],
        path: relativePath,
        exists: true
      };

      const updatedProtobuf = {
        ...protobufConfig,
        importPaths: updatedImportPaths
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true };
    } catch (error) {
      console.error('Error replacing import path:', error);
      return { success: false, error };
    }
  };

  const replaceProtoFileInCollection = async (index: number, newFilePath: string): Promise<OperationResult> => {
    try {
      const relativePath = getRelativePath(collection.pathname, newFilePath, true);
      const updatedProtoFiles = [...collectionProtoFiles];
      updatedProtoFiles[index] = {
        ...updatedProtoFiles[index],
        path: relativePath,
        type: 'file',
        exists: true
      };

      const updatedProtobuf = {
        ...protobufConfig,
        protoFiles: updatedProtoFiles
      };

      dispatch(updateCollectionProtobuf({
        collectionUid: collection.uid,
        protobuf: updatedProtobuf
      }));

      return { success: true };
    } catch (error) {
      console.error('Error replacing proto file:', error);
      return { success: false, error };
    }
  };

  return {
    protoFiles: protoFilesWithExistence,
    importPaths: importPathsWithExistence,
    isLoadingMethods,
    loadMethodsFromProtoFile,
    addProtoFileToCollection,
    addImportPathToCollection,
    addImportPathFromRequest,
    toggleImportPath,
    toggleImportPathFromRequest,
    browseForProtoFile,
    browseForImportDirectory,
    removeProtoFileFromCollection,
    removeImportPathFromCollection,
    replaceImportPathInCollection,
    replaceProtoFileInCollection,
    addProtoFileFromRequest
  };
}
