/// <reference types="multer" />
import { BadRequestException, PipeTransform } from '@nestjs/common';
import { detectMimeFromContent, inspectSvg } from '../file-signature';

export interface FilePipeOptions {
  maxSizeMb?: number;
  allowedMimes?: string[];
  maxFiles?: number;
  required?: boolean;
}

const DEFAULT_ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

const MIME_ALIASES: Record<string, string[]> = {
  'image/jpeg': ['image/jpg'],
};

/**
 * Validates an uploaded file (or an array of them) with `@UploadedFile(...)` /
 * `@UploadedFiles(...)`. It checks, in order:
 *
 *   1. the file is present (unless `required: false`),
 *   2. the byte size is within `maxSizeMb`,
 *   3. the declared MIME type is allowed,
 *   4. the real content matches the declared type (magic bytes),
 *   5. an SVG is static (no script/event handlers/foreign entities).
 *
 * The declared MIME type alone is attacker-controlled, which is why the content
 * is verified too.
 */
export class FilePipe
  implements PipeTransform<Express.Multer.File | Express.Multer.File[]>
{
  constructor(private readonly options: FilePipeOptions = {}) {}

  transform(
    input: Express.Multer.File | Express.Multer.File[],
  ): Express.Multer.File | Express.Multer.File[] {
    const { required = true, maxFiles } = this.options;

    if (Array.isArray(input)) {
      if (input.length === 0) {
        if (required) throw new BadRequestException('File is required');
        return input;
      }

      if (maxFiles !== undefined && input.length > maxFiles) {
        throw new BadRequestException(
          `At most ${maxFiles} file(s) per upload. Received: ${input.length}.`,
        );
      }

      input.forEach((file, index) => this.validate(file, index));
      return input;
    }

    if (!input) {
      if (required) throw new BadRequestException('File is required');
      return input;
    }

    this.validate(input);
    return input;
  }

  private validate(file: Express.Multer.File, index?: number): void {
    const { maxSizeMb = 5, allowedMimes = DEFAULT_ALLOWED_MIMES } = this.options;

    const label =
      file?.originalname ??
      (index !== undefined ? `file #${index + 1}` : 'file');

    if (!file) {
      throw new BadRequestException(`${label} is not valid`);
    }

    const maxBytes = maxSizeMb * 1024 * 1024;
    if (file.size > maxBytes) {
      const actualMb = (file.size / 1024 / 1024).toFixed(2);
      throw new BadRequestException(
        `${label}: size exceeds the ${maxSizeMb}MB limit (file is ${actualMb}MB)`,
      );
    }

    if (!allowedMimes.includes(file.mimetype)) {
      throw new BadRequestException(
        `${label}: type "${file.mimetype}" is not allowed. Allowed: ${allowedMimes.join(', ')}`,
      );
    }

    this.validateContent(file, label, allowedMimes);
  }

  private validateContent(
    file: Express.Multer.File,
    label: string,
    allowedMimes: string[],
  ): void {
    if (!file.buffer || file.buffer.length === 0) {
      throw new BadRequestException(`${label}: file contents are empty or unreadable`);
    }

    const detected = detectMimeFromContent(file.buffer);

    if (!detected) {
      throw new BadRequestException(
        `${label}: file contents are not a recognised allowed type`,
      );
    }

    if (!allowedMimes.includes(detected)) {
      throw new BadRequestException(
        `${label}: file contents detected as "${detected}", which is not allowed`,
      );
    }

    if (!this.mimeMatches(file.mimetype, detected)) {
      throw new BadRequestException(
        `${label}: file contents do not match the declared type ` +
          `(declared "${file.mimetype}", detected "${detected}")`,
      );
    }

    if (detected === 'image/svg+xml') {
      const inspection = inspectSvg(file.buffer);
      if (!inspection.safe) {
        throw new BadRequestException(
          `${label}: SVG rejected because it contains ${inspection.reason}. ` +
            'Icons must be static SVGs without scripts.',
        );
      }
    }
  }

  private mimeMatches(claimed: string, detected: string): boolean {
    if (claimed === detected) return true;
    return (MIME_ALIASES[detected] ?? []).includes(claimed);
  }
}
