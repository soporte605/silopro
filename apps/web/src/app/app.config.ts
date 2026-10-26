import { provideHttpClient, withFetch, withInterceptors } from '@angular/common/http';
import {
  type ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';
import { landingRoutes, routes } from './app.routes';
import { apiInterceptor } from './core/api';
import { SessionService } from './core/session';
import { siteKind } from './core/site';

const landingSite = siteKind() === 'landing';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(landingSite ? landingRoutes : routes, withComponentInputBinding()),
    provideHttpClient(withFetch(), withInterceptors([apiInterceptor])),
    // Los guards necesitan saber si hay sesión antes de la primera navegación.
    // En el dominio comercial no hay sesión: la cookie es solo de la app.
    provideAppInitializer(() => (landingSite ? undefined : inject(SessionService).load())),
  ],
};
