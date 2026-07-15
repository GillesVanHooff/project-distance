import { defineConfig } from 'vite';

// GitHub Pages serves project sites from /<repo>/, not the domain root, so
// production builds need that prefix baked into asset URLs. Local dev keeps
// serving from / so `npm run dev` is unaffected.
export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : '/project-distance/',
}));
