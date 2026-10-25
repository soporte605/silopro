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
    path: 'recuperar-contrasena',
    canActivate: [guestGuard],
    loadComponent: () => import('./pages/auth/forgot-password'),
    title: 'Recuperar contraseña · SiloPro',
  },
  {
    path: 'restablecer-contrasena',
    loadComponent: () => import('./pages/auth/reset-password'),
    title: 'Nueva contraseña · SiloPro',
  },
  {
    path: 'verificar-correo',
    loadComponent: () => import('./pages/auth/verify-email'),
    title: 'Confirmar correo · SiloPro',
  },
  {
    path: 'producto',
    loadComponent: () => import('./pages/public/landing'),
    title: 'SiloPro · Inventario con ubicación física',
  },
  {
    path: 'privacidad',
    loadComponent: () => import('./pages/public/privacy'),
    title: 'Aviso de privacidad · SiloPro',
  },
  {
    path: 'terminos',
    loadComponent: () => import('./pages/public/terms'),
    title: 'Términos y condiciones · SiloPro',
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
        path: 'ubicaciones/:id',
        loadComponent: () => import('./pages/locations/location-detail'),
        title: 'Ubicación · SiloPro',
      },
      {
        path: 'miembros',
        loadComponent: () => import('./pages/members/members'),
        title: 'Miembros · SiloPro',
      },
      {
        path: 'gabinetes',
        loadComponent: () => import('./pages/cabinet/cabinets'),
        title: 'Gabinetes · SiloPro',
      },
      {
        path: 'gabinetes/demo',
        loadComponent: () => import('./pages/cabinet/cabinet-demo'),
        title: 'Gabinete (demo) · SiloPro',
      },
      {
        path: 'gabinetes/estante/:id',
        loadComponent: () => import('./pages/cabinet/shelf-3d'),
        title: 'Gabinetes en 3D · SiloPro',
      },
      {
        path: 'gabinetes/:id',
        loadComponent: () => import('./pages/cabinet/cabinet-editor'),
        title: 'Gabinete · SiloPro',
      },
      {
        path: 'transferencias',
        loadComponent: () => import('./pages/transfers/transfers'),
        title: 'Transferencias · SiloPro',
      },
      {
        path: 'escanear',
        loadComponent: () => import('./pages/scan/scanner'),
        title: 'Escanear etiqueta · SiloPro',
      },
      {
        path: 'movimientos',
        loadComponent: () => import('./pages/journal/movements-journal'),
        title: 'Movimientos · SiloPro',
      },
      {
        path: 'auditoria',
        loadComponent: () => import('./pages/audit/audit-log'),
        title: 'Auditoría · SiloPro',
      },
      {
        path: 'proyectos',
        loadComponent: () => import('./pages/projects/projects'),
        title: 'Proyectos · SiloPro',
      },
      {
        path: 'proyectos/:id',
        loadComponent: () => import('./pages/projects/project-detail'),
        title: 'Proyecto · SiloPro',
      },
      {
        path: 'compras',
        loadComponent: () => import('./pages/shopping/shopping-list'),
        title: 'Lista de compras · SiloPro',
      },
      {
        path: 'plan',
        loadComponent: () => import('./pages/billing/billing'),
        title: 'Plan y facturación · SiloPro',
      },
      {
        path: 'reportes',
        loadComponent: () => import('./pages/reports/reports'),
        title: 'Reportes · SiloPro',
      },
      {
        path: 'importar',
        loadComponent: () => import('./pages/import/import-items'),
        title: 'Importar artículos · SiloPro',
      },
      {
        path: 'reservas',
        loadComponent: () => import('./pages/reservations/reservations'),
        title: 'Reservas · SiloPro',
      },
      {
        path: 'etiquetas',
        loadComponent: () => import('./pages/labels/labels'),
        title: 'Etiquetas · SiloPro',
      },
      {
        path: 'q/:tipo/:codigo',
        loadComponent: () => import('./pages/labels/qr-resolve'),
        title: 'Abriendo etiqueta · SiloPro',
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
