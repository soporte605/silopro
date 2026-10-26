import { z } from 'zod';
import es from 'zod/v4/locales/es.js';

// Mensajes de validación en español para API y web por igual.
z.config(es());

export * from './audit.js';
export * from './auth.js';
export * from './billing.js';
export * from './cabinets.js';
export * from './catalog.js';
export * from './common.js';
export * from './health.js';
export * from './import.js';
export * from './locate.js';
export * from './members.js';
export * from './photos.js';
export * from './projects.js';
export * from './qr.js';
export * from './reports.js';
export * from './shopping.js';
export * from './stock.js';
