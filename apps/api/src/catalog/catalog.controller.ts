import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  categoryInputSchema,
  itemInputSchema,
  itemListQuerySchema,
  itemUpdateSchema,
  supplierInputSchema,
  unitInputSchema,
} from '@silopro/contracts';
import { z } from 'zod';
import { Org, OrgGuard, RequirePermission, SessionGuard } from '../auth/guards.js';
import type { OrgContext } from '../auth/request-context.js';
import { ZodValidationPipe } from '../common/zod-validation.pipe.js';
import { CategoriesService } from './categories.service.js';
import { ItemsService } from './items.service.js';
import { SuppliersService } from './suppliers.service.js';
import { UnitsService } from './units.service.js';

const withVersion = <T extends z.ZodObject>(s: T) =>
  s.extend({ version: z.coerce.number().int().min(1) });
const uuid = new ParseUUIDPipe({ version: '7' });

@Controller('orgs/:orgId')
@UseGuards(SessionGuard, OrgGuard)
@RequirePermission('catalog.read')
export class CatalogController {
  constructor(
    @Inject(UnitsService) private readonly unitsSvc: UnitsService,
    @Inject(CategoriesService) private readonly categoriesSvc: CategoriesService,
    @Inject(SuppliersService) private readonly suppliersSvc: SuppliersService,
    @Inject(ItemsService) private readonly itemsSvc: ItemsService,
  ) {}

  // Unidades
  @Get('units')
  listUnits(@Org() ctx: OrgContext) {
    return this.unitsSvc.list(ctx);
  }

  @Post('units')
  @RequirePermission('catalog.write')
  createUnit(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(unitInputSchema)) body: z.output<typeof unitInputSchema>,
  ) {
    return this.unitsSvc.create(ctx, body);
  }

  // Categorías
  @Get('categories')
  listCategories(@Org() ctx: OrgContext) {
    return this.categoriesSvc.list(ctx);
  }

  @Post('categories')
  @RequirePermission('catalog.write')
  createCategory(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(categoryInputSchema)) body: z.output<typeof categoryInputSchema>,
  ) {
    return this.categoriesSvc.create(ctx, body);
  }

  @Patch('categories/:id')
  @RequirePermission('catalog.write')
  updateCategory(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(withVersion(categoryInputSchema)))
    body: z.output<typeof categoryInputSchema> & { version: number },
  ) {
    return this.categoriesSvc.update(ctx, id, body);
  }

  @Delete('categories/:id')
  @HttpCode(204)
  @RequirePermission('catalog.write')
  archiveCategory(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.categoriesSvc.archive(ctx, id);
  }

  // Proveedores
  @Get('suppliers')
  listSuppliers(@Org() ctx: OrgContext) {
    return this.suppliersSvc.list(ctx);
  }

  @Post('suppliers')
  @RequirePermission('catalog.write')
  createSupplier(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(supplierInputSchema)) body: z.output<typeof supplierInputSchema>,
  ) {
    return this.suppliersSvc.create(ctx, body);
  }

  @Patch('suppliers/:id')
  @RequirePermission('catalog.write')
  updateSupplier(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(withVersion(supplierInputSchema)))
    body: z.output<typeof supplierInputSchema> & { version: number },
  ) {
    return this.suppliersSvc.update(ctx, id, body);
  }

  // Artículos
  @Get('items')
  listItems(
    @Org() ctx: OrgContext,
    @Query(new ZodValidationPipe(itemListQuerySchema)) query: z.output<typeof itemListQuerySchema>,
  ) {
    return this.itemsSvc.list(ctx, query);
  }

  @Get('items/:id')
  getItem(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.itemsSvc.get(ctx, id);
  }

  @Post('items')
  @RequirePermission('catalog.write')
  createItem(
    @Org() ctx: OrgContext,
    @Body(new ZodValidationPipe(itemInputSchema)) body: z.output<typeof itemInputSchema>,
  ) {
    return this.itemsSvc.create(ctx, body);
  }

  @Patch('items/:id')
  @RequirePermission('catalog.write')
  updateItem(
    @Org() ctx: OrgContext,
    @Param('id', uuid) id: string,
    @Body(new ZodValidationPipe(itemUpdateSchema)) body: z.output<typeof itemUpdateSchema>,
  ) {
    return this.itemsSvc.update(ctx, id, body);
  }

  @Delete('items/:id')
  @HttpCode(204)
  @RequirePermission('catalog.write')
  archiveItem(@Org() ctx: OrgContext, @Param('id', uuid) id: string) {
    return this.itemsSvc.archive(ctx, id);
  }
}
