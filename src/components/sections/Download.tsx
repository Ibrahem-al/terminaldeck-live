import { Button, DownloadButton } from '../ui/Button'
import { RELEASES_URL } from '../../lib/links'
import { INSTALLER, RELEASE_DATE_ISO, RELEASE_DATE_LABEL, VERSION } from '../../lib/facts'

/**
 * Download: one centred Deepwater card on paper. Headline, lead, the two actions, four spec
 * facts, and the SmartScreen note for the first install.
 */
export function Download() {
  return (
    <section id="download" aria-labelledby="download-title" className="band band-paper">
      <div className="wrap">
        <div className="band-deep cta-card text-fg">
          <h2 id="download-title" className="cta-title">
            Put your agents on one deck
          </h2>
          <p className="sec-lede">
            One {INSTALLER.sizeLabel} installer. No account, no cloud, no telemetry. The app updates itself from then
            on.
          </p>
          <div className="hero2-ctas">
            <DownloadButton size="lg" />
            <Button href={RELEASES_URL} variant="secondary" size="lg">
              All releases
            </Button>
          </div>
          <dl className="cta-specs">
            <div>
              <dt>Version</dt>
              <dd className="tnum">
                {VERSION} · <time dateTime={RELEASE_DATE_ISO}>{RELEASE_DATE_LABEL}</time>
              </dd>
            </div>
            <div>
              <dt>Requires</dt>
              <dd>Windows 10 or 11, {INSTALLER.arch}</dd>
            </div>
            <div>
              <dt>Installs</dt>
              <dd>For your user only</dd>
            </div>
            <div>
              <dt>Updates</dt>
              <dd>Signed, checked with SHA-512</dd>
            </div>
          </dl>
          <p className="max-w-[40em] text-[15px] leading-relaxed text-fg-2">
            The first time you install, Windows SmartScreen may warn you because the installer isn’t
            Authenticode-signed. Choose <b className="font-semibold text-fg">More info</b>, then{' '}
            <b className="font-semibold text-fg">Run anyway</b>.
          </p>
        </div>
      </div>
    </section>
  )
}
