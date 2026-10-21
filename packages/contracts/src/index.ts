import { z } from 'zod';
import es from 'zod/v4/locales/es.js';

// Mensajes de validación en español para API y web por igual.
z.config(es());

export * from './auth.js';
export * from './catalog.js';
export * from './common.js';
export * from './health.js';
export * from './members.js';
export * from './photos.js';
export * from './qr.js';
export * from './stock.js';
