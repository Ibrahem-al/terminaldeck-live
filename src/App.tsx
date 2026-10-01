import { Nav } from './components/sections/Nav'
import { Hero } from './components/sections/Hero'
import { Pillars } from './components/sections/Pillars'
import { Notch } from './components/sections/Notch'
import { Agents } from './components/sections/Agents'
import { Features } from './components/sections/Features'
import { Numbers } from './components/sections/Numbers'
import { ReleaseLog } from './components/sections/ReleaseLog'
import { Download } from './components/sections/Download'
import { Faq } from './components/sections/Faq'
import { Footer } from './components/sections/Footer'

/** Page order is fixed. Each section file is owned by one builder. */
export function App() {
  return (
    <>
      <a className="skip-link" href="#download">
        Skip to download
      </a>
      <Nav />
      <main id="top">
        <Hero />
        <Pillars />
        <Notch />
        <Agents />
        <Features />
        <Numbers />
        <ReleaseLog />
        <Download />
        <Faq />
      </main>
      <Footer />
    </>
  )
}
