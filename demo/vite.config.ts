/**
 * The demo builds with rust_app's OWN toolchain (Vite 7, plugin-react 5,
 * @tailwindcss/vite 4.3 from rust_app/node_modules), so the renderer compiles
 * exactly as it does in the app. Nothing here is resolved from the website's
 * node_modules.
 *
 *   npm run demo:dev     → http://127.0.0.1:5301/
 *   npm run build:demo   → website/public/demo (served at /demo/)
 */
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { Alias, Plugin, PluginOption, UserConfig } from 'vite'

const demoDir = dirname(fileURLToPath(import.meta.url))
const siteDir = resolve(demoDir, '..')
const rustApp = resolve(demoDir, '../../rust_app')
const requireFromApp = createRequire(resolve(rustApp, 'package.json'))

const posix = (p: string): string => p.replace(/\\/g, '/')
const underDemo = (id: string): boolean => posix(id).toLowerCase().startsWith(posix(demoDir).toLowerCase() + '/')

async function fromApp<T>(id: string): Promise<T> {
  const mod = (await import(pathToFileURL(requireFromApp.resolve(id)).href)) as { default?: T }
  return (mod.default ?? mod) as T
}

/**
 * Bare imports written in demo/ (`@tauri-apps/api/mocks`, fonts…) resolve
 * exactly as if the renderer had imported them, so the demo and the app share
 * one copy of every package — in dev that means the same pre-bundled module.
 */
function resolveFromRustApp(): Plugin {
  const appImporter = resolve(rustApp, 'src/main.tsx')
  return {
    name: 'demo:resolve-from-rust-app',
    enforce: 'pre',
    resolveId(source, importer, options) {
      if (!importer || !underDemo(importer)) return null
      if (/^(\.|\/|\\|[a-zA-Z]:|\0|virtual:|@vite\/)/.test(source)) return null
      return this.resolve(source, appImporter, { ...options, skipSelf: true })
    }
  }
}

/**
 * React pinned by file. plugin-react puts react/react-dom and the JSX runtimes
 * in the optimizer's `include`, which resolves them from the Vite root (demo/)
 * and so found the WEBSITE's React: two Reacts in dev, "Invalid hook call".
 */
function reactFromRustApp(): Alias[] {
  const ids = ['react', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'react-dom', 'react-dom/client']
  return ids.map((id) => ({
    find: new RegExp(`^${id.replace('/', '\\/')}$`),
    replacement: posix(requireFromApp.resolve(id))
  }))
}

/**
 * The renderer's global.css says `@import 'tailwindcss'` with automatic source
 * detection, and @tailwindcss/vite scans from the Vite ROOT — here demo/, which
 * holds none of the renderer's class names, so the UI would come out unstyled.
 * Pin the scan base to rust_app, which is what the app's own build scans.
 */
function tailwindScansRustApp(): Plugin {
  const globalCss = posix(resolve(rustApp, 'src/styles/global.css')).toLowerCase()
  return {
    name: 'demo:tailwind-source',
    enforce: 'pre',
    transform(code, id) {
      if (posix(id.split('?')[0]).toLowerCase() !== globalCss) return null
      const next = code.replace(/@import\s+['"]tailwindcss['"]\s*;/, `@import 'tailwindcss' source('${posix(rustApp)}');`)
      if (next === code) this.error('rust_app/src/styles/global.css no longer starts with @import "tailwindcss"')
      return { code: next, map: null }
    }
  }
}

/**
 * The app's font-preload plugin with RELATIVE hrefs (the app's uses `/`,
 * which would break under /demo/): the main window's three faces start
 * loading before ~850 KB of module JS has run.
 */
function fontPreload(): Plugin {
  const want = [
    /ibm-plex-mono-latin-400-normal-[^/]*\.woff2$/,
    /ibm-plex-mono-latin-600-normal-[^/]*\.woff2$/,
    /schibsted-grotesk-latin-wght-normal-[^/]*\.woff2$/
  ]
  return {
    name: 'demo:font-preload',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !posix(ctx.filename).endsWith('/app.html')) return html
        const tags = Object.keys(ctx.bundle)
          .filter((f) => want.some((r) => r.test(f)))
          .map((f) => ({
            tag: 'link',
            attrs: { rel: 'preload', as: 'font', type: 'font/woff2', crossorigin: '', href: `./${f}` },
            injectTo: 'head' as const
          }))
        return { html, tags }
      }
    }
  }
}

export default async (): Promise<UserConfig> => {
  const react = await fromApp<() => PluginOption>('@vitejs/plugin-react')
  const tailwindcss = await fromApp<() => PluginOption>('@tailwindcss/vite')

  return {
    root: demoDir,
    // Relative, so the build works at /demo/ on the site and from a plain file server.
    base: './',
    publicDir: false,
    cacheDir: resolve(demoDir, '.vite'),
    clearScreen: false,
    plugins: [resolveFromRustApp(), tailwindScansRustApp(), react(), tailwindcss(), fontPreload()],
    resolve: {
      alias: [
        { find: /^@renderer\//, replacement: `${posix(resolve(rustApp, 'src'))}/` },
        { find: /^@shared\//, replacement: `${posix(resolve(rustApp, 'shared'))}/` },
        ...reactFromRustApp()
      ]
    },
    server: {
      host: '127.0.0.1',
      port: 5301,
      strictPort: true,
      fs: { allow: [demoDir, rustApp] },
      watch: { ignored: ['**/src-tauri/**', '**/.vite/**'] }
    },
    preview: { host: '127.0.0.1', port: 5301, strictPort: true },
    build: {
      outDir: resolve(siteDir, 'public/demo'),
      emptyOutDir: true,
      // Visitors bring any modern browser, not only WebView2.
      target: 'es2022',
      sourcemap: false,
      // Monaco is one lazy chunk by design; the warning is noise.
      chunkSizeWarningLimit: 4096,
      rollupOptions: {
        input: {
          index: resolve(demoDir, 'index.html'),
          app: resolve(demoDir, 'app.html'),
          notch: resolve(demoDir, 'notch.html')
        }
      }
    }
  }
}
