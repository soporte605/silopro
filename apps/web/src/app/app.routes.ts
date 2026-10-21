import type { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/home/home'), title: 'Inicio · SiloPro' },
  {
    path: 'gabinetes/demo',
    loadComponent: () => import('./pages/cabinet/cabinet-demo'),
    title: 'Gabinete (demo) · SiloPro',
  },
  {
    path: 'sistema/componentes',
    loadComponent: () => import('./pages/catalog/catalog'),
    title: 'Componentes · SiloPro',
  },
  { path: '**', redirectTo: '' },
];
