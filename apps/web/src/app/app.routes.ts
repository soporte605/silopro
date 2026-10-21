import type { Routes } from '@angular/router';
import { authGuard, guestGuard } from './core/guards';
import { Shell } from './layout/shell';

export const routes: Routes = [
  {
    path: 'acceso',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/login'),
    title: 'Iniciar sesión · SiloPro',
  },
  {
    path: 'registro',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/register'),
    title: 'Crear cuenta · SiloPro',
  },
  {
    path: 'invitacion/:orgId/:token',
    loadComponent: () => import('./pages/auth/invitation'),
    title: 'Invitación · SiloPro',
  },
  {
    path: '',
    component: Shell,
    canActivate: [authGuard],
    children: [
      { path: '', loadComponent: () => import('./pages/home/home'), title: 'Inicio · SiloPro' },
      {
        path: 'inventario',
        loadComponent: () => import('./pages/items/items-list'),
        title: 'Artículos · SiloPro',
      },
      {
        path: 'inventario/:id',
        loadComponent: () => import('./pages/items/item-detail'),
        title: 'Artículo · SiloPro',
      },
      {
        path: 'categorias',
        loadComponent: () => import('./pages/categories/categories'),
        title: 'Categorías · SiloPro',
      },
      {
        path: 'proveedores',
        loadComponent: () => import('./pages/suppliers/suppliers'),
        title: 'Proveedores · SiloPro',
      },
      {
        path: 'ubicaciones',
        loadComponent: () => import('./pages/locations/locations'),
        title: 'Ubicaciones · SiloPro',
      },
      {
        path: 'miembros',
        loadComponent: () => import('./pages/members/members'),
        title: 'Miembros · SiloPro',
      },
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
    ],
  },
  { path: '**', redirectTo: '' },
];
