import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare'; // El import va aquí arriba

export default defineConfig({
  output: 'server',
  adapter: cloudflare(), // El objeto solo contiene la clave y el valor
});
