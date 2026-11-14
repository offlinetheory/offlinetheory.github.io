import PageHeader from '../components/PageHeader.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './PrivacyPage.css'

export default function PrivacyPage() {
  useMeta({
    title: 'Privacy policy',
    description: 'How OFFLINE THEORY collects and uses information, including the newsletter, hosting, and affiliate links.',
  })
  return (
    <div className="privacy">
      <PageHeader kicker="Privacy / Effective November 14, 2026" title="Privacy policy" />
      <div className="privacy__body">
        <p>
          This page describes what OFFLINE THEORY collects and why. It is a plain account of how the site works today, not legal advice.
        </p>

        <h2 className="label col-label">Who we are</h2>
        <p>
          OFFLINE THEORY is an independent digital security journal edited by Jamiah McQuiller and published at{' '}
          <a href="https://offlinetheory.github.io/">offlinetheory.github.io</a>. The site is hosted on GitHub Pages.
        </p>

        <h2 className="label col-label">What this site does not do</h2>
        <p>
          The site does not use advertising scripts, analytics, or social-media tracking pixels. It does not set its own cookies, and it does not use the browser’s local storage to identify you. There are no user accounts and no comments.
        </p>

        <h2 className="label col-label">Information GitHub may collect when you visit</h2>
        <p>
          Because the site is hosted on GitHub Pages, GitHub may receive standard technical information when your browser requests a page, such as your IP address, browser type, and the address of the page you asked for. That collection is governed by GitHub’s own privacy statement. We do not operate those servers, and we do not receive a personal analytics report from GitHub.
        </p>

        <h2 className="label col-label">Newsletter</h2>
        <p>
          If you subscribe, the signup form is provided by Beehiiv. Pages that include the form load a script from Beehiiv (subscribe-forms.beehiiv.com). The email address you enter is collected and stored by Beehiiv so we can send the weekly dispatch. Beehiiv’s privacy policy governs how they handle that information. We use the form only to send the newsletter. You can unsubscribe with the link in any issue.
        </p>

        <h2 className="label col-label">Fonts and scripts</h2>
        <p>
          Typefaces are stored with the site and served from the same host. We do not load fonts from Google Fonts or another font CDN. The only third-party script the site loads today is Beehiiv’s newsletter form, and only on pages that include the signup.
        </p>

        <h2 className="label col-label">Search</h2>
        <p>
          Search runs in your browser against the articles already on the site. Your queries are not sent to us or to a search provider.
        </p>

        <h2 className="label col-label">Affiliate links</h2>
        <p>
          Some articles include product links marked as sponsored. OFFLINE THEORY may earn a commission if you buy through those links. Clicking one takes you to the seller’s site, which has its own privacy practices. We do not add our own analytics parameters to those links. If that changes, this policy will be updated.
        </p>

        <h2 className="label col-label">Advertising</h2>
        <p>
          This site does not currently run display ads. If ads are added later, this policy will be updated before that happens, including which network is used and what data it may collect.
        </p>

        <h2 className="label col-label">External links</h2>
        <p>
          Articles and other pages link to websites we do not control, including news sources and product pages. Those sites are not covered by this policy.
        </p>

        <h2 className="label col-label">Contact</h2>
        <p>
          For questions about this policy, contact Jamiah McQuiller at{' '}
          <a href="mailto:offlinetheory@proton.me">offlinetheory@proton.me</a>, on{' '}
          <a href="https://www.linkedin.com/in/jamiahmcquiller" target="_blank" rel="noopener noreferrer">LinkedIn</a>
          {' '}or at{' '}
          <a href="https://jamiahmcquiller.github.io" target="_blank" rel="noopener noreferrer">jamiahmcquiller.github.io</a>.
        </p>

        <h2 className="label col-label">Changes</h2>
        <p>
          If we change how the site collects or uses information, we will update this page and the effective date.
        </p>
      </div>
    </div>
  )
}
