import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuthenticator } from '@aws-amplify/ui-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { TabLibraryCard } from '../components/TabLibrary/TabLibraryCard'
import { loadPublishedTabs, type PublishedTabRecord } from '../api/publishedTabApi'
import './TabLibraryPage.css'

export function TabLibraryPage() {
  const navigate = useNavigate()
  const { authStatus } = useAuthenticator(ctx => [ctx.authStatus])

  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [results, setResults] = useState<PublishedTabRecord[]>([])
  const [nextToken, setNextToken] = useState<string | undefined>()
  const [isLoading, setIsLoading] = useState(false)
  const [hasSearched, setHasSearched] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query), 700)
    return () => clearTimeout(t)
  }, [query])

  const fetchPage = useCallback(async (q: string, token: string | undefined) => {
    await Promise.resolve()  // ensure setState is not called synchronously from effect
    if (!token) {
      setResults([])
      setNextToken(undefined)
    }
    setIsLoading(true)
    const { tabs, nextToken: nt } = await loadPublishedTabs(q || undefined, 20, token)
    setResults((prev) => token ? [...prev, ...tabs] : tabs)
    setNextToken(nt)
    setIsLoading(false)
    setHasSearched(true)
  }, [])

  useEffect(() => {
    if (authStatus !== 'authenticated') return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchPage(debouncedQuery, undefined)
  }, [debouncedQuery, authStatus, fetchPage])

  if (authStatus !== 'authenticated') {
    return (
      <div className="tab-library-page">
        <div className="tab-library-header">
          <h1>Tab Library</h1>
          <p>Browse and play guitar tabs shared by the community.</p>
        </div>
        <div className="tab-library-auth-prompt">
          <p>Sign in to browse published tabs.</p>
          <Button variant="outline" onClick={() => navigate('/')}>Go Home</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="tab-library-page">
      <div className="tab-library-header">
        <h1>Tab Library</h1>
        <p>Browse and play guitar tabs shared by the community. Click any result to open it.</p>
      </div>

      <div className="tab-library-search">
        <Input
          placeholder="Search by title or artist…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
      </div>

      <div className="tab-library-results">
        {isLoading && results.length === 0 && (
          <div className="tab-library-loading">Searching…</div>
        )}

        {!isLoading && hasSearched && results.length === 0 && (
          <div className="tab-library-empty">
            {debouncedQuery
              ? `No tabs found for "${debouncedQuery}".`
              : 'No published tabs yet. Be the first to publish!'}
          </div>
        )}

        {results.map((tab) => (
          <TabLibraryCard key={tab.id} tab={tab} />
        ))}

        {nextToken && (
          <div className="tab-library-load-more">
            <Button
              variant="outline"
              size="sm"
              disabled={isLoading}
              onClick={() => void fetchPage(debouncedQuery, nextToken)}
            >
              {isLoading ? 'Loading…' : 'Load more'}
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}
