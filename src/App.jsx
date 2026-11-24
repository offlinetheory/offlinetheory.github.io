import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Header from './components/Header.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import SectionPage from './pages/SectionPage.jsx'
import ArticlePage from './pages/ArticlePage.jsx'
import AboutPage from './pages/AboutPage.jsx'
import SearchPage from './pages/SearchPage.jsx'
import PrivacyPage from './pages/PrivacyPage.jsx'
import NotFound from './pages/NotFound.jsx'

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <a href="#main" className="skip-link">Skip to content</a>
      <ScrollToTop />
      <Header />
      <main id="main" className="page" tabIndex={-1}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/news" element={<SectionPage slug="news" />} />
          <Route path="/analysis" element={<SectionPage slug="analysis" />} />
          <Route path="/tools" element={<SectionPage slug="tools" />} />
          <Route path="/guides" element={<SectionPage slug="guides" />} />
          <Route path="/awareness-training" element={<SectionPage slug="awareness-training" />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/article/:slug" element={<ArticlePage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <div className="page"><Footer /></div>
    </>
  )
}

