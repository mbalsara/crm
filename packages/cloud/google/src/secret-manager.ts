import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import TTLCache from '@isaacs/ttlcache';

const CACHE = new TTLCache<string, string>({
  max: 100, // maximum number of items
  ttl: 1000 * 60 * 5, // 5 minutes - how long to live in ms
});

const secretmanagerClient = new SecretManagerServiceClient();

const getSecretVersions = async (key: string, projectId?: string): Promise<string[]> => {
  const resolvedProjectId = projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

  const parent = `projects/${resolvedProjectId}/secrets/${key}`;

  console.info(`parent: ${parent}, key: ${key}`);

  const request = {
    parent,
  };
  const iterable = await secretmanagerClient.listSecretVersionsAsync(request);
  const versions: string[] = [];

  for await (const response of iterable) {
    if (response.name) {
      versions.push(response.name);
      break;
    }
  }
  return versions;
};

const getSecretValue = async (key: string, projectId?: string, version = 'latest'): Promise<string | undefined> => {
  const resolvedProjectId = projectId || process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GOOGLE_CLOUD_PROJECT;

  try {
    let name;

    if (version === 'previous') {
      const versions = await getSecretVersions(key, projectId);

      if (versions && versions.length > 1) {
        name = versions[1];
      } else {
        return undefined;
      }
    } else {
      name = `projects/${resolvedProjectId}/secrets/${key}/versions/${version}`;
    }
    console.info(`name: ${name}`);
    const [secretVersion] = await secretmanagerClient.accessSecretVersion({ name });
    const payload = secretVersion?.payload?.data?.toString();

    return payload;
  } catch (error) {
    console.error(`FAILED:getSecretValue: key: ${key}, projectId: ${resolvedProjectId}, error: ${error}`);
    throw error;
  }
};

const getSecretValueSafe = async (key: string, projectId?: string, version = 'latest'): Promise<string | undefined> => {
  try {
    return await getSecretValue(key, projectId, version);
  } catch (error) {
    console.warn(`FAILED:getSecretValue: key: ${key}, error: ${error}`);
    return undefined;
  }
};

/**
 * Lookup key in cache before calling secrets
 * @param key secret key
 * @param version version of the key. defaulted to latest version
 * @returns key value if it exists else undefined
 */
const getCachedSecretValue = async (
  key: string,
  projectId?: string,
  version = 'latest'
): Promise<string | undefined> => {
  let value = CACHE.get(key);

  if (!value) {
    value = await getSecretValue(key, projectId, version);
    if (value) CACHE.set(key, value);
  }
  return value;
};

export const SecretClient = {
  getCachedSecretValue,
  getSecretValue,
  getSecretValueSafe,
};
