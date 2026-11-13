/**
 * Shared types for the upload module.
 *
 * `UploadedFile` mirrors the subset of multer's file object the service needs,
 * so the service never has to depend on multer's own types.
 */
export type UploadKind = 'image' | 'document';

export interface UploadedFile {
  buffer: Buffer;
  mimetype: string;
  size: number;
  originalname?: string;
}

export interface UploadResult {
  /** Secure delivery URL — safe to store in the database and expose to clients. */
  url: string;
  /**
   * Cloudinary identifier. Keep it in the database (next to the URL) so the
   * asset can be deleted later. Never send it to the client.
   */
  publicId: string;
  resourceType: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}

/** Parsed `cloudinary://<key>:<secret>@<cloud>` value. */
export interface ParsedCloudinaryUrl {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}
