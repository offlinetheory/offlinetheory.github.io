import Masthead from '../components/Masthead.jsx'
import JournalList from '../components/JournalList.jsx'
import HeroBook from '../components/HeroBook.jsx'
import LatestList from '../components/LatestList.jsx'
import InfoBar from '../components/InfoBar.jsx'
import Newsletter from '../components/Newsletter.jsx'
import { useMeta } from '../hooks/useMeta.js'
import './Home.css'

export default function Home() {
  useMeta({})
  return (
    <>
      <Masthead />
      <div className="home-grid">
        <div className="home-grid__journal"><JournalList /></div>
        <div className="home-grid__hero"><HeroBook /></div>
        <div className="home-grid__latest"><LatestList /></div>
      </div>
      <InfoBar />
      <Newsletter />
    </>
  )
}
