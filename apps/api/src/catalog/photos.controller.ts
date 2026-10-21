import {
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MAX_PHOTO_BYTES, type PhotoSize } from '@silopro/contracts';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { notFound } from '../common/http.js';
import { PhotosService } from './photos.service.js';

const uuid = new ParseUUIDPipe({ version: '7' });

@Controller('orgs/:orgId/items/:itemId/photos')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class PhotosController {
  constructor(@Inject(PhotosService) private readonly photos: PhotosService) {}

  @Get()
  list(@Org() ctx: OrgContext, @Param('itemId', uuid) itemId: string) {
    return this.photos.list(ctx, itemId);
  }

  @Post()
  @RequirePermission('catalog.write')
  @UseInterceptors(
    // Sin `dest` ni `storage`, multer guarda el archivo en memoria (nunca en disco sin validar).
    FileInterceptor('file', {
      // El límite se aplica mientras se recibe: un archivo mayor se corta con 413.
      limits: { fileSize: MAX_PHOTO_BYTES, files: 1, fields: 0 },
    }),
  )
  upload(
    @Org() ctx: OrgContext,
    @Param('itemId', uuid) itemId: string,
    @UploadedFile() file: { buffer: Buffer } | undefined,
  ) {
    return this.photos.upload(ctx, itemId, file?.buffer);
  }

  @Get(':photoId/:size')
  // Los ids de fotografía nunca se reutilizan: el contenido es inmutable.
  @Header('Cache-Control', 'private, max-age=31536000, immutable')
  file(
    @Org() ctx: OrgContext,
    @Param('itemId', uuid) itemId: string,
    @Param('photoId', uuid) photoId: string,
    @Param('size') size: string,
  ) {
    if (size !== 'thumb' && size !== 'full') throw notFound('Fotografía');
    return this.photos.file(ctx, itemId, photoId, size as PhotoSize);
  }

  @Post(':photoId/portada')
  @RequirePermission('catalog.write')
  @HttpCode(200)
  makeCover(
    @Org() ctx: OrgContext,
    @Param('itemId', uuid) itemId: string,
    @Param('photoId', uuid) photoId: string,
  ) {
    return this.photos.makeCover(ctx, itemId, photoId);
  }

  @Delete(':photoId')
  @HttpCode(204)
  @RequirePermission('catalog.write')
  remove(
    @Org() ctx: OrgContext,
    @Param('itemId', uuid) itemId: string,
    @Param('photoId', uuid) photoId: string,
  ) {
    return this.photos.remove(ctx, itemId, photoId);
  }
}
