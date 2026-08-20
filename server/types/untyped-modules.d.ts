// Minimal ambient declarations for runtime dependencies that ship no types and have
// no @types package installed here. The JavaScript side of the server has always used
// these modules; these declarations only cover the surface the TypeScript modules touch,
// so adding a real @types package later would simply replace this file.

declare module 'mime-types' {
  const mimeTypes: {
    lookup(pathOrExtension: string): string | false;
  };
  export default mimeTypes;
}

declare module 'multer' {
  import type { RequestHandler } from 'express';

  export type MulterFile = {
    path: string;
    originalname: string;
    size: number;
    mimetype: string;
  };

  type StorageEngine = unknown;

  type DiskStorageOptions = {
    destination: (req: unknown, file: unknown, cb: (error: Error | null, destination: string) => void) => void;
    filename: (req: unknown, file: unknown, cb: (error: Error | null, filename: string) => void) => void;
  };

  type MulterOptions = {
    storage?: StorageEngine;
    limits?: {
      fileSize?: number;
      files?: number;
    };
  };

  type MulterInstance = {
    array(fieldName: string, maxCount?: number): RequestHandler;
  };

  type MulterFactory = {
    (options?: MulterOptions): MulterInstance;
    diskStorage(options: DiskStorageOptions): StorageEngine;
  };

  const multer: MulterFactory;
  export default multer;
}
