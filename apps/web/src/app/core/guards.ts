import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session';
import { APP_ORIGIN, siteKind } from './site';

export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  if (session.me()) return true;
  // En la red local la raíz sin sesión muestra la página comercial; en el
  // servidor esa página tiene su propio dominio y la app abre el acceso.
  if (state.url === '/') {
    return inject(Router).createUrlTree([siteKind() === 'local' ? '/producto' : '/acceso']);
  }
  return inject(Router).createUrlTree(['/acceso'], { queryParams: { volver: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  return inject(SessionService).me() ? inject(Router).createUrlTree(['/']) : true;
};

/** En el dominio comercial, cualquier ruta de la app se abre en app.silopro. */
export const toAppGuard: CanActivateFn = (_route, state) => {
  location.assign(APP_ORIGIN + state.url);
  return false;
};
