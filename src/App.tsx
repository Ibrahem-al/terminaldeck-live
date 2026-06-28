import { Nav } from './components/sections/Nav'
import { Hero } from './components/sections/Hero'
import { Problem } from './components/sections/Problem'
import { Cockpit } from './components/sections/Cockpit'
import { Agents } from './components/sections/Agents'
import { Workspace } from './components/sections/Workspace'
import { KanbanDemo } from './components/sections/KanbanDemo'
import { ThemeGallery } from './components/sections/ThemeGallery'
import { RemoteDeck } from './components/sections/RemoteDeck'
import { Notifications } from './components/sections/Notifications'
import { Comparison } from './components/sections/Comparison'
import { Personas } from './components/sections/Personas'
import { Architecture } from './components/sections/Architecture'
import { Privacy } from './components/sections/Privacy'
import { Faq } from './components/sections/Faq'
import { Download } from './components/sections/Download'
import { Footer } from './components/sections/Footer'
import { Toaster } from './components/ui/Toaster'

export function App(): React.JSX.Element {
  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-base">
      <Nav />
      <main id="top">
        <Hero />
        <Problem />
        <Cockpit />
        <Agents />
        <Workspace />
        <KanbanDemo />
        <ThemeGallery />
        <RemoteDeck />
        <Notifications />
        <Comparison />
        <Personas />
        <Architecture />
        <Privacy />
        <Faq />
        <Download />
      </main>
      <Footer />
      <Toaster />
    </div>
  )
}
