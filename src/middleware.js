// src/middleware.js
// Protege rutas que requieren autenticación.
// Astro SSR ejecuta este archivo en cada request del servidor.

import { defineMiddleware } from 'astro:middleware';

// Rutas que NO requieren autenticación
const PUBLIC_ROUTES = ['/login', '/register', '/join'];

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;

  // Permitir rutas públicas y assets
  const isPublic =
    PUBLIC_ROUTES.some(r => pathname === r || pathname.startsWith(r + '?')) ||
    pathname.startsWith('/_') ||
    pathname.startsWith('/base.css') ||
    pathname.includes('.');

  if (isPublic) {
    return next();
  }

  // Leer el refreshToken de la cookie (lo seteamos al hacer login)
  const refreshToken = context.cookies.get('refreshToken')?.value;

  if (!refreshToken) {
    // Sin token → redirigir al login
    return context.redirect('/login');
  }

  // Pasar el token al contexto para que las páginas lo usen
  context.locals.refreshToken = refreshToken;

  return next();
});
