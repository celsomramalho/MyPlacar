import {
  deleteObject,
  getDownloadURL,
  getMetadata,
  getStorage,
  listAll,
  ref,
  uploadBytes,
  type FirebaseStorage,
  type StorageReference,
} from 'firebase/storage';

export interface FirebaseAdminStorageFile {
  name: string;
  fullPath: string;
  url: string;
  size: number;
  updated: string;
  contentType: string;
}

const normalizeBucketName = (bucketName: string) => bucketName.trim().replace(/^gs:\/\//, '');

const getStorageForBucket = (
  mainStorage: FirebaseStorage,
  defaultBucketName: string,
  bucketName: string,
) => {
  const cleanBucketName = normalizeBucketName(bucketName);
  return cleanBucketName === defaultBucketName
    ? mainStorage
    : getStorage(mainStorage.app, `gs://${cleanBucketName}`);
};

const mapStorageFile = async (item: StorageReference): Promise<FirebaseAdminStorageFile> => {
  try {
    const [url, metadata] = await Promise.all([
      getDownloadURL(item),
      getMetadata(item),
    ]);

    return {
      name: item.name,
      fullPath: item.fullPath,
      url,
      size: metadata.size,
      updated: metadata.timeCreated,
      contentType: metadata.contentType || 'unknown',
    };
  } catch (_e) {
    return {
      name: item.name,
      fullPath: item.fullPath,
      url: '#',
      size: 0,
      updated: '',
      contentType: 'unknown',
    };
  }
};

export const fetchAdminStorageFiles = async (
  mainStorage: FirebaseStorage,
  defaultBucketName: string,
  bucketName: string,
): Promise<FirebaseAdminStorageFile[]> => {
  const storageInstance = getStorageForBucket(mainStorage, defaultBucketName, bucketName);
  const allFiles: FirebaseAdminStorageFile[] = [];

  const crawl = async (folderRef: StorageReference) => {
    try {
      const result = await listAll(folderRef);
      const levelFiles = await Promise.all(result.items.map(mapStorageFile));
      allFiles.push(...levelFiles);

      for (const prefix of result.prefixes) {
        await crawl(prefix);
      }
    } catch (err: unknown) {
      const storageErr = err as { code?: string };
      if (storageErr.code === 'storage/unauthorized') {
        throw new Error('Acesso negado ao bucket. Verifique as regras de segurança.');
      }

      throw err;
    }
  };

  await crawl(ref(storageInstance, ''));
  return allFiles;
};

export const uploadAdminStorageFile = (
  mainStorage: FirebaseStorage,
  defaultBucketName: string,
  bucketName: string,
  file: File,
) => {
  const storageInstance = getStorageForBucket(mainStorage, defaultBucketName, bucketName);
  const storageRef = ref(storageInstance, `${Date.now()}_${file.name}`);
  return uploadBytes(storageRef, file);
};

export const deleteAdminStorageFile = (
  mainStorage: FirebaseStorage,
  defaultBucketName: string,
  bucketName: string,
  path: string,
) => {
  const storageInstance = getStorageForBucket(mainStorage, defaultBucketName, bucketName);
  return deleteObject(ref(storageInstance, path));
};
