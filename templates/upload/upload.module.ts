import { Global, Module } from '@nestjs/common';
import { UploadService } from './upload.service';

/**
 * Shared file-storage infrastructure (Cloudinary).
 *
 * `@Global()` so any feature can inject `UploadService` without importing this
 * module again — do not re-import it in feature modules.
 */
@Global()
@Module({
  providers: [UploadService],
  exports: [UploadService],
})
export class UploadModule {}
