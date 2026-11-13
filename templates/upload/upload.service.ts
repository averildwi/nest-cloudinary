import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Readable } from 'node:stream';
import { v2 as cloudinary, UploadApiOptions, UploadApiResponse } from 'cloudinary';
import {
  ParsedCloudinaryUrl,
  UploadKind,
  UploadResult,
  UploadedFile,
} from './upload.types';

/**
 * Optimizations applied to every image upload by default: cap the width, let
 * Cloudinary choose the quality and the best modern format (WebP/AVIF) per
 * browser. Override per call with `transformation`.
 */
const DEFAULT_IMAGE_TRANSFORMATION = [
  { width: 1080, crop: 'limit' },
  { quality: 'auto' },
  { fetch_format: 'auto' },
];

export interface UploadFileOptions {
  /** Cloudinary folder, e.g. `'projects/thumbnails'`. */
  folder?: string;
  /** `'image'` (default) or `'document'` (raw: PDFs and other non-images). */
  kind?: UploadKind;
  /** Override the default image transformation. Ignored for documents. */
  transformation?: UploadApiOptions['transformation'];
}

/**
 * Parses the `cloudinary://<key>:<secret>@<cloud>` value used by CLOUDINARY_URL.
 * Exported so it can be unit-tested without touching the SDK.
 */
export function parseCloudinaryUrl(url: string): ParsedCloudinaryUrl {
  const match = /^cloudinary:\/\/([^:]+):([^@]+)@(.+)$/.exec(url);
  if (!match) {
    throw new Error('CLOUDINARY_URL must look like cloudinary://key:secret@cloud');
  }
  return { apiKey: match[1], apiSecret: match[2], cloudName: match[3] };
}

@Injectable()
export class UploadService {
  private readonly logger = new Logger(UploadService.name);

  constructor(config: ConfigService) {
    const { cloudName, apiKey, apiSecret } = parseCloudinaryUrl(
      config.getOrThrow<string>('CLOUDINARY_URL'),
    );
    cloudinary.config({
      cloud_name: cloudName,
      api_key: apiKey,
      api_secret: apiSecret,
      secure: true,
    });
  }

  /**
   * Uploads one file (typically a small buffer from multer's memory storage).
   * `folder` groups the assets; `kind: 'document'` stores PDFs and other raw
   * files without image processing.
   */
  async uploadFile(
    file: UploadedFile,
    options: UploadFileOptions = {},
  ): Promise<UploadResult> {
    const kind: UploadKind = options.kind ?? 'image';
    const isImage = kind === 'image';

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const upload = cloudinary.uploader.upload_stream(
        {
          folder: options.folder,
          resource_type: isImage ? 'image' : 'raw',
          ...(isImage
            ? { transformation: options.transformation ?? DEFAULT_IMAGE_TRANSFORMATION }
            : {}),
        },
        (error, response) => {
          if (error || !response) {
            reject(error instanceof Error ? error : new Error('Cloudinary upload failed'));
            return;
          }
          resolve(response);
        },
      );

      Readable.from(file.buffer).pipe(upload);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
      resourceType: result.resource_type,
      width: result.width ?? 0,
      height: result.height ?? 0,
      format: result.format ?? '',
      bytes: result.bytes ?? 0,
    };
  }

  /**
   * Deletes one asset. `resourceType` must match the upload (`'raw'` for PDFs),
   * otherwise Cloudinary will not find it. "Not found" counts as success.
   */
  async deleteFile(publicId: string, resourceType = 'image'): Promise<void> {
    const result = await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceType,
    });
    if (result.result !== 'ok' && result.result !== 'not found') {
      throw new Error(`Cloudinary could not delete "${publicId}": ${result.result}`);
    }
  }

  /**
   * Best-effort cleanup for "replace the old image" flows: parses the public id
   * and resource type out of a stored URL and deletes it. Failures are logged,
   * never thrown, so they cannot break the business operation.
   */
  async deleteByUrl(url: string | null | undefined): Promise<boolean> {
    if (!url) return false;

    const parsed = UploadService.parseUrl(url);
    if (!parsed) return false;

    try {
      await this.deleteFile(parsed.publicId, parsed.resourceType);
      return true;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.logger.error(`Cloudinary cleanup failed for ${url}: ${reason}`);
      return false;
    }
  }

  /**
   * Extracts `{ publicId, resourceType }` from a Cloudinary delivery URL.
   * The extension is part of a `raw` public id (e.g. a PDF) and is kept; for
   * images it is stripped. Returns null for anything that is not a Cloudinary
   * upload URL, so callers can treat it as "nothing to delete".
   */
  static parseUrl(url: string): { publicId: string; resourceType: string } | null {
    try {
      const segments = url.split('/');
      const uploadIndex = segments.findIndex((part) => part === 'upload');
      if (uploadIndex === -1) return null;

      const resourceType = segments[uploadIndex - 1] === 'raw' ? 'raw' : 'image';

      // Skip the version segment (v123456) that sits right after "upload".
      const pathParts = segments.slice(uploadIndex + 2);
      let publicId = pathParts.join('/');
      if (!publicId) return null;

      if (resourceType === 'image') {
        const dotIndex = publicId.lastIndexOf('.');
        if (dotIndex !== -1) publicId = publicId.substring(0, dotIndex);
      }

      return { publicId, resourceType };
    } catch {
      return null;
    }
  }
}
