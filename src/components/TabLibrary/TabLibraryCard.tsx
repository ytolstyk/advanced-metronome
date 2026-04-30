import { useNavigate } from 'react-router-dom'
import type { PublishedTabRecord } from '../../api/publishedTabApi'

interface TabLibraryCardProps {
  tab: PublishedTabRecord
}

export function TabLibraryCard({ tab }: TabLibraryCardProps) {
  const navigate = useNavigate()
  const date = new Date(tab.publishedAt).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
  const meta = [tab.artist, tab.year].filter(Boolean).join(' · ')

  return (
    <button
      className="tab-library-card"
      onClick={() => navigate(`/tabs/${tab.id}`)}
    >
      <div className="tab-library-card-icon">🎸</div>
      <div className="tab-library-card-body">
        <span className="tab-library-card-title">{tab.name || 'Untitled'}</span>
        {meta && <span className="tab-library-card-meta">{meta}</span>}
        <span className="tab-library-card-sub">
          {tab.tabAuthor ? `Tab by ${tab.tabAuthor}` : ''}
          {tab.tabAuthor && date ? ' · ' : ''}
          {date}
        </span>
      </div>
      <span className="tab-library-card-arrow">View →</span>
    </button>
  )
}
