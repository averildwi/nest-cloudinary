# Usage Guide

How to use the injected upload module. The CLI writes everything under
`src/common/upload/` and registers `UploadModule` in `src/app.module.ts`.

## Contents

| File | Purpose |
|---|---|
| `upload.module.ts` | `@Global()` module; exports `UploadService` |
| `upload.service.ts` | `uploadFile`, `deleteFile`, `deleteByUrl`, `UploadService.parseUrl` |
| `upload.types.ts` | `UploadKind`, `UploadedFile`, `UploadResult`, `ParsedCloudinaryUrl` |
| `pipes/file.pipe.ts` | `FilePipe` validation for `@UploadedFile(...)` |
| `file-signature.ts` | `detectMimeFromContent`, `inspectSvg` (pure helpers) |

## 1. Environment

`.env.example` gets:

```
# Cloudinary credentials: cloudinary://<api-key>:<api-secret>@<cloud-name>
CLOUDINARY_URL="cloudinary://<api-key>:<api-secret>@<cloud-name>"
```

Copy it into your real `.env` with actual values. The service reads it lazily via
`ConfigService.getOrThrow('CLOUDINARY_URL')`, so a missing value fails fast when
the service is constructed.

Validate it on boot by adding the key to your Joi project schema
(`AppConfigModule.forProject(projectEnvSchema)`):

```typescript
// src/config/env.schema.ts
import * as Joi from 'joi';

export const projectEnvSchema = Joi.object({
  CLOUDINARY_URL: Joi.string().uri().required(),
});
```

## 2. A controller with an upload endpoint

```typescript
import {
  Controller,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { MessageResponse } from '../common/interceptors/transform.interceptor';
import { FilePipe } from '../common/upload/pipes/file.pipe';
import { UsersService } from './users.service';

@ApiTags('Users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  async uploadAvatar(
    @Param('id') id: string,
    @UploadedFile(new FilePipe({ maxSizeMb: 2 })) file: Express.Multer.File,
  ) {
    await this.usersService.updateAvatar(id, file);
    return new MessageResponse(null, 'Avatar updated');
  }
}
```

`FileInterceptor('file')` uses multer's memory storage by default, which is what
`UploadService.uploadFile` expects (it reads `file.buffer`).

### FilePipe options

```typescript
new FilePipe({ maxSizeMb: 5, allowedMimes: ['image/jpeg', 'image/png', 'image/webp'] })
new FilePipe({ maxSizeMb: 10, allowedMimes: ['application/pdf'] })
new FilePipe({ maxSizeMb: 5, allowedMimes: [...IMAGE_MIMES, 'application/pdf'], maxFiles: 5 })
new FilePipe({ required: false })
```

`FilePipe` checks, in order: presence → byte size → declared MIME → real content
(magic bytes) → SVG safety. The declared MIME alone is attacker-controlled, which
is why content is verified too.

## 3. The service

```typescript
import { Injectable } from '@nestjs/common';
import { UploadService } from '../common/upload/upload.service';

@Injectable()
export class UsersService {
  constructor(private readonly upload: UploadService) {}

  async updateAvatar(id: string, file: Express.Multer.File) {
    // Replace flow: best-effort delete of the previous asset (logged on failure).
    const current = await this.findById(id);
    await this.upload.deleteByUrl(current.avatarUrl);

    // Image upload (default kind). Use { kind: 'document' } for PDFs/raw files.
    const result = await this.upload.uploadFile(file, { folder: 'users/avatars' });

    return this.prisma.user.update({
      where: { id },
      data: { avatarUrl: result.url, avatarPublicId: result.publicId },
    });
  }
}
```

`uploadFile(file, { folder, kind, transformation })` returns:

```typescript
{
  url: string;        // secure delivery URL — safe to expose
  publicId: string;   // store it; needed to delete later. Never send it to clients
  resourceType: string;
  width: number;
  height: number;
  format: string;
  bytes: number;
}
```

## 4. Storing assets: URL + publicId

Keep the public id next to the URL so the asset can be deleted later:

```prisma
model User {
  avatarUrl      String?
  avatarPublicId String?
}
```

Return only the URL to clients. Use a narrow `select` so `publicId` never leaks:

```typescript
export const userSelect = {
  id: true,
  name: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;
```

## 5. Deleting

```typescript
await this.upload.deleteFile(publicId, 'image'); // throws on failure
await this.upload.deleteFile(publicId, 'raw');    // for PDFs/raw files
await this.upload.deleteByUrl(storedUrl);         // best-effort, logs failures
```

- Use `resourceType` that matches the upload — deleting a PDF as `image` silently
  does nothing.
- Use `deleteByUrl` in "replace" flows where a failed cleanup must not break the
  request. It parses the public id and keeps the extension for `raw`.
- `UploadService.parseUrl(url)` is a pure static helper you can unit-test:

  ```typescript
  UploadService.parseUrl(
    'https://res.cloudinary.com/demo/image/upload/v1/users/avatars/a.webp',
  ); // -> { publicId: 'users/avatars/a', resourceType: 'image' }
  ```

## 6. Upload-then-write consistency

When you upload and then write to the database, clean up the orphan if the write
fails:

```typescript
const result = await this.upload.uploadFile(file, { folder: 'invoices' });
try {
  return await this.prisma.invoice.create({ data: { url: result.url, ... } });
} catch (error) {
  await this.upload.deleteFile(result.publicId, result.resourceType).catch(() => {});
  throw error;
}
```

## 7. Testing

The two pure helpers are the easiest to test:

```typescript
import { detectMimeFromContent, inspectSvg } from '../common/upload/file-signature';
import { UploadService } from '../common/upload/upload.service';

detectMimeFromContent(Buffer.from([0xff, 0xd8, 0xff])); // 'image/jpeg'
inspectSvg(Buffer.from('<svg><script/></svg>')).safe;    // false
UploadService.parseUrl('https://example.com/x.png');     // null
```

Mock `UploadService` in feature tests with `{ provide: UploadService, useValue: { uploadFile: jest.fn(), deleteByUrl: jest.fn() } }`.
