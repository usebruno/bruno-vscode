
// TODO: Import actual packages when dependencies are set up
// import { fromIni } from '@aws-sdk/credential-providers';
// import { aws4Interceptor } from 'aws4-axios';
import type { AxiosInstance } from 'axios';

interface AwsV4Config {
  profileName?: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
  region?: string;
  service?: string;
}

interface RequestWithAwsConfig {
  awsv4config?: AwsV4Config;
}

function isStrPresent(str: string | undefined | null): boolean {
  return Boolean(str && str !== '' && str !== 'undefined');
}

async function resolveAwsV4Credentials(request: RequestWithAwsConfig): Promise<AwsV4Config> {
  const awsv4 = request.awsv4config;
  if (!awsv4) {
    return {};
  }

  if (isStrPresent(awsv4.profileName)) {
    try {
      // TODO: Implement with @aws-sdk/credential-providers
      // const credentialsProvider = fromIni({
      //   profile: awsv4.profileName,
      //   ignoreCache: true
      // });
      // const credentials = await credentialsProvider();
      // awsv4.accessKeyId = credentials.accessKeyId;
      // awsv4.secretAccessKey = credentials.secretAccessKey;
      // awsv4.sessionToken = credentials.sessionToken;
      console.warn('AWS profile-based credentials not yet implemented');
    } catch {
      console.error('Failed to fetch credentials from AWS profile.');
    }
  }

  return awsv4;
}

function addAwsV4Interceptor(axiosInstance: AxiosInstance, request: RequestWithAwsConfig): void {
  if (!request.awsv4config) {
    console.warn('No Auth Config found!');
    return;
  }

  const awsv4 = request.awsv4config;
  if (!isStrPresent(awsv4.accessKeyId) || !isStrPresent(awsv4.secretAccessKey)) {
    console.warn('Required Auth Fields are not present');
    return;
  }

  // TODO: Implement with aws4-axios
  // const interceptor = aws4Interceptor({
  //   options: {
  //     region: awsv4.region,
  //     service: awsv4.service
  //   },
  //   credentials: {
  //     accessKeyId: awsv4.accessKeyId,
  //     secretAccessKey: awsv4.secretAccessKey,
  //     sessionToken: awsv4.sessionToken
  //   }
  // });
  // axiosInstance.interceptors.request.use(interceptor);

  console.warn('AWS V4 Interceptor not yet implemented');
}

export {
  addAwsV4Interceptor,
  resolveAwsV4Credentials,
  isStrPresent,
  AwsV4Config,
  RequestWithAwsConfig
};
