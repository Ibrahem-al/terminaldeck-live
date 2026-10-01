import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Preload the upright Latin Archivo (every heading and paragraph) on both pages. Relative hrefs. */
function fontPreload(): Plugin {
  const want = [/archivo-latin-wdth-normal-[^/]*\.woff2$/]
  return {
    name: 'site:font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle) return html
        const prefix = ctx.filename.replace(/\\/g, '/').includes('/docs/') ? '../' : './'
        const tags = Object.keys(ctx.bundle)
          .filter((f) => want.some((r) => r.test(f)))
          .map((f) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: prefix + f },
            injectTo: 'head' as const
          }))
        return { html, tags }
      }
    }
  }
}

/** Serve /docs locally the way production does (vercel.json rewrites /docs → /docs/index.html). */
function docsWithoutSlash(): Plugin {
  const rewrite = (req: { url?: string }, to: string): void => {
    if (req.url === '/docs' || req.url?.startsWith('/docs?')) req.url = req.url.replace('/docs', to)
  }
  return {
    name: 'site:docs-no-slash',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req, '/docs/')
        next()
      })
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, _res, next) => {
        rewrite(req, '/docs/index.html')
        next()
      })
    }
  }
}

// Relative base so the static build works on any host (Vercel root, a subpath, a plain file server).
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss(), fontPreload(), docsWithoutSlash()],
  server: { port: 4317 },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        docs: resolve(__dirname, 'docs/index.html')
      }
    }
  }
})
