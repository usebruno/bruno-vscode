import * as vscode from 'vscode';
import { uuid, safeStringifyJSON, safeParseJSON } from '../utils/common';
import { encryptStringSafe, decryptStringSafe } from '../utils/encryption';

interface Credential {
  url: string;
  data: string;
  credentialsId: string;
}

interface OAuth2DataForCollection {
  collectionUid: string;
  sessionId?: string;
  credentials?: Credential[];
}

let extensionContext: vscode.ExtensionContext | null = null;

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context;
}

class Oauth2Store {
  private getFromStorage<T>(key: string, defaultValue: T): T {
    if (!extensionContext) {
      return defaultValue;
    }
    return extensionContext.globalState.get<T>(key, defaultValue);
  }

  private setInStorage<T>(key: string, value: T): void {
    if (!extensionContext) {
      console.error('Extension context not set');
      return;
    }
    extensionContext.globalState.update(key, value);
  }

  getAllOauth2Data(): OAuth2DataForCollection[] {
    let oauth2Data = this.getFromStorage<OAuth2DataForCollection[]>('oauth2.collections', []);
    if (!Array.isArray(oauth2Data)) oauth2Data = [];
    return oauth2Data;
  }

  getOauth2DataOfCollection({ collectionUid }: { collectionUid: string; url?: string }): OAuth2DataForCollection {
    const oauth2Data = this.getAllOauth2Data();
    let oauth2DataForCollection = oauth2Data.find((d) => d?.collectionUid === collectionUid);

    if (!oauth2DataForCollection) {
      const newOauth2DataForCollection: OAuth2DataForCollection = { collectionUid };
      const updatedOauth2Data = [...oauth2Data, newOauth2DataForCollection];
      this.setInStorage('oauth2.collections', updatedOauth2Data);
      return newOauth2DataForCollection;
    }

    return oauth2DataForCollection;
  }

  updateOauth2DataOfCollection({ collectionUid, data }: { collectionUid: string; url?: string; data: OAuth2DataForCollection }): void {
    const oauth2Data = this.getAllOauth2Data();
    const updatedOauth2Data = oauth2Data.filter((d) => d.collectionUid !== collectionUid);
    updatedOauth2Data.push({ ...data });
    this.setInStorage('oauth2.collections', updatedOauth2Data);
  }

  createNewOauth2SessionIdForCollection({ collectionUid, url }: { collectionUid: string; url?: string }): OAuth2DataForCollection {
    const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });
    const newSessionId = uuid();
    const newOauth2DataForCollection: OAuth2DataForCollection = {
      ...oauth2DataForCollection,
      sessionId: newSessionId
    };
    this.updateOauth2DataOfCollection({ collectionUid, data: newOauth2DataForCollection });
    return newOauth2DataForCollection;
  }

  getSessionIdOfCollection({ collectionUid, url }: { collectionUid: string; url?: string }): string | undefined {
    try {
      const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });

      if (oauth2DataForCollection?.sessionId && typeof oauth2DataForCollection.sessionId === 'string') {
        return oauth2DataForCollection.sessionId;
      }

      const newOauth2DataForCollection = this.createNewOauth2SessionIdForCollection({ collectionUid, url });
      return newOauth2DataForCollection?.sessionId;
    } catch (err) {
      console.error('error retrieving session id from cache', err);
      return undefined;
    }
  }

  clearSessionIdOfCollection({ collectionUid, url }: { collectionUid: string; url?: string }): void {
    try {
      const oauth2Data = this.getAllOauth2Data();
      const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });
      delete oauth2DataForCollection.sessionId;
      delete oauth2DataForCollection.credentials;

      const updatedOauth2Data = oauth2Data.filter((d) => d.collectionUid !== collectionUid);
      updatedOauth2Data.push({ ...oauth2DataForCollection });
      this.setInStorage('oauth2.collections', updatedOauth2Data);
    } catch (err) {
      console.error('error while clearing the oauth2 session cache', err);
    }
  }

  getCredentialsForCollection({ collectionUid, url, credentialsId }: { collectionUid: string; url: string; credentialsId: string }): unknown | null {
    try {
      const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });
      const credentials = oauth2DataForCollection?.credentials?.find((c) => c?.url === url && c?.credentialsId === credentialsId);
      if (!credentials?.data) return null;
      const decryptionResult = decryptStringSafe(credentials?.data);
      const decryptedCredentialsData = safeParseJSON(decryptionResult.value);
      return decryptedCredentialsData;
    } catch (err) {
      console.error('error retrieving oauth2 credentials from cache', err);
      return null;
    }
  }

  updateCredentialsForCollection({ collectionUid, url, credentialsId, credentials = {} }: {
    collectionUid: string;
    url: string;
    credentialsId: string;
    credentials?: Record<string, unknown>;
  }): OAuth2DataForCollection | undefined {
    try {
      const encryptionResult = encryptStringSafe(safeStringifyJSON(credentials) || '');
      const encryptedCredentialsData = encryptionResult.value;
      const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });
      let filteredCredentials = oauth2DataForCollection?.credentials?.filter((c) => c?.url !== url || c?.credentialsId !== credentialsId);
      if (!filteredCredentials) filteredCredentials = [];
      filteredCredentials.push({
        url,
        data: encryptedCredentialsData,
        credentialsId
      });
      const newOauth2DataForCollection: OAuth2DataForCollection = {
        ...oauth2DataForCollection,
        credentials: filteredCredentials
      };
      this.updateOauth2DataOfCollection({ collectionUid, data: newOauth2DataForCollection });
      return newOauth2DataForCollection;
    } catch (err) {
      console.error('error updating oauth2 credentials from cache', err);
      return undefined;
    }
  }

  clearCredentialsForCollection({ collectionUid, url, credentialsId }: { collectionUid: string; url: string; credentialsId: string }): OAuth2DataForCollection | undefined {
    try {
      const oauth2DataForCollection = this.getOauth2DataOfCollection({ collectionUid, url });
      const filteredCredentials = oauth2DataForCollection?.credentials?.filter((c) => c?.url !== url || c?.credentialsId !== credentialsId);
      const newOauth2DataForCollection: OAuth2DataForCollection = {
        ...oauth2DataForCollection,
        credentials: filteredCredentials
      };
      this.updateOauth2DataOfCollection({ collectionUid, data: newOauth2DataForCollection });
      return newOauth2DataForCollection;
    } catch (err) {
      console.error('error clearing oauth2 credentials from cache', err);
      return undefined;
    }
  }
}

export default Oauth2Store;
export { Oauth2Store };
