import { inject } from '@angular/core';
import { type CanActivateFn, Router } from '@angular/router';
import { SessionService } from './session';

export const authGuard: CanActivateFn = (_route, state) => {
  const session = inject(SessionService);
  if (session.me()) return true;
  return inject(Router).createUrlTree(['/acceso'], { queryParams: { volver: state.url } });
};

export const guestGuard: CanActivateFn = () => {
  return inject(SessionService).me() ? inject(Router).createUrlTree(['/']) : true;
};
