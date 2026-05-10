import { useEffect, useState, useCallback } from 'react'
import { useLocation } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { Plus, Search, ChevronRight, RefreshCw } from 'lucide-react'
import {
  CANDIDATE_PIPELINE_STAGES as PIPELINE_STAGES,
  stageColor,
  stageLabel,
} from '../../lib/constants'
import AddCandidateModal from './AddCandidateModal'
import CandidateDetail from './CandidateDetail'
import { ListSkeleton } from '../../components/Skeleton'

const PAGE_SIZE = 20

// stageColor and stageLabel are re-exported so other files that previously
// imported them from this module (e.g. CandidateDetail) continue to work.
export { stageColor, stageLabel }

export default function Candidates() {
  const location = useLocation()
  const [candidates, setCandidates] = useState([])
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [refreshing, setRefreshing] = useState(false)
  const [offset, setOffset] = useState(0)
  const [hasMore, setHasMore] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStage, setFilterStage] = useState('all')
  const [showAdd, setShowAdd] = useState(false)
  const [selected, setSelected] = useState(null)
  const [stageCounts, setStageCounts] = useState({})
  const [error, setError] = useState(null)

  useEffect(() => {
    if (location.state?.openId && location.state?.openData) {
      setSelected(location.state.openData)
      globalThis.history.replaceState({}, '')
    }
  }, [location.state])

  // ── Improvement B ──────────────────────────────────────────────────────────
  // Old approach: SELECT status FROM candidates (fetches every row, counts in JS)
  // New approach: ask Postgres to GROUP BY status and return only the counts.
  //
  // This uses a simple Supabase RPC backed by this SQL function (add once to DB):
  //
  //   create or replace function get_candidate_stage_counts()
  //   returns table(status text, count bigint)
  //   language sql stable security definer as $$
  //     select coalesce(status, 'new') as status, count(*) as count
  //     from candidates
  //     group by coalesce(status, 'new');
  //   $$;
  //
  // If the RPC isn't available yet (returns an error), we fall back to the
  // original approach so nothing breaks during the migration.
  // ───────────────────────────────────────────────────────────────────────────
  const fetchStageCounts = useCallback(async () => {
    const { data, error: rpcError } = await supabase.rpc('get_candidate_stage_counts')

    if (!rpcError && data) {
      const counts = {}
      data.forEach(row => { counts[row.status] = Number(row.count) })
      setStageCounts(counts)
      return
    }

    // Fallback: original client-side approach
    console.warn('get_candidate_stage_counts RPC not available, falling back:', rpcError?.message)
    const { data: rows } = await supabase.from('candidates').select('status')
    const counts = {}
    rows?.forEach(c => {
      const s = c.status || 'new'
      counts[s] = (counts[s] || 0) + 1
    })
    setStageCounts(counts)
  }, [])

  useEffect(() => { fetchStageCounts() }, [fetchStageCounts])

  const fetchCandidates = useCallback(async (searchTerm, stage, newOffset = 0) => {
    if (newOffset === 0) setLoading(true)
    else setSearching(true)
    setError(null)

    try {
      let query = supabase
        .from('candidates')
        .select('*, agents(full_name)')
        .order('created_at', { ascending: false })
        .range(newOffset, newOffset + PAGE_SIZE - 1)

      if (stage && stage !== 'all') query = query.eq('status', stage)
      if (searchTerm?.trim()) query = query.or(`full_name.ilike.%${searchTerm}%,phone.ilike.%${searchTerm}%`)

      const { data, error: err } = await query
      if (err) throw err
      const results = data || []

      if (newOffset === 0) setCandidates(results)
      else setCandidates(prev => [...prev, ...results])

      setHasMore(results.length === PAGE_SIZE)
      setOffset(newOffset)
    } catch {
      setError('Failed to load candidates. Tap refresh to try again.')
    } finally {
      setLoading(false)
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    const t = setTimeout(() => fetchCandidates(search, filterStage, 0), 300)
    return () => clearTimeout(t)
  }, [search, filterStage, fetchCandidates])

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([
      fetchCandidates(search, filterStage, 0),
      fetchStageCounts(),
    ])
    setRefreshing(false)
  }

  async function loadMore() {
    await fetchCandidates(search, filterStage, offset + PAGE_SIZE)
  }

  const totalCount = Object.values(stageCounts).reduce((a, b) => a + b, 0)

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-extrabold text-slate-100">Candidates</h1>
            <p className="text-slate-500 text-sm">{totalCount} total</p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handleRefresh} disabled={refreshing}
              className="p-2 rounded-xl bg-slate-800 text-slate-400 disabled:opacity-50">
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            </button>
            <button onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-teal-600 text-white px-4 py-2.5 rounded-xl text-sm font-bold shadow-lg">
              <Plus size={16} /> Add
            </button>
          </div>
        </div>

        <div className="relative">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
          <label htmlFor="candidate-search" className="sr-only">Search candidates</label>
          <input id="candidate-search" value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search by name or phone..."
            className="w-full bg-slate-900 border border-slate-800 rounded-xl pl-9 pr-4 py-3 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500" />
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <button onClick={() => setFilterStage('all')}
            className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filterStage === 'all' ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
            All {totalCount > 0 && `(${totalCount})`}
          </button>
          {PIPELINE_STAGES.filter(s => stageCounts[s.key]).map(s => (
            <button key={s.key} onClick={() => setFilterStage(s.key)}
              className={`flex-none px-3 py-1.5 rounded-full text-xs font-bold transition-colors ${filterStage === s.key ? 'bg-indigo-500 text-white' : 'bg-slate-800 text-slate-400'}`}>
              {s.label} ({stageCounts[s.key]})
            </button>
          ))}
        </div>

        {error ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <p className="text-red-400 text-sm text-center">{error}</p>
            <button onClick={handleRefresh} className="bg-indigo-500 text-white font-bold px-5 py-2.5 rounded-xl text-sm">Retry</button>
          </div>
        ) : loading ? (
          <ListSkeleton rows={7} hasSearch={false} hasTabs={false} />
        ) : (
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden">
            {candidates.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600 text-sm mb-3">{search ? `No results for "${search}"` : 'No candidates found'}</p>
                {!search && (
                  <button onClick={() => setShowAdd(true)} className="text-indigo-400 text-sm font-semibold">
                    + Add first candidate
                  </button>
                )}
              </div>
            ) : (
              <>
                <ul>
                  {candidates.map((c, i) => (
                    <li key={c.id}
                      className={`flex items-center gap-3 px-4 py-4 transition-colors ${i < candidates.length - 1 ? 'border-b border-slate-800' : ''}`}>
                      <button type="button" className="contents cursor-pointer" onClick={() => setSelected(c)}>
                        <div className="w-10 h-10 rounded-full bg-emerald-500/15 flex items-center justify-center text-emerald-400 font-bold text-sm flex-none">
                          {c.full_name?.[0]?.toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-slate-200 text-sm font-semibold truncate">{c.full_name}</p>
                          <p className="text-slate-500 text-xs">{c.phone} · {c.nationality}</p>
                          {c.agents?.full_name && (
                            <p className="text-indigo-400 text-xs mt-0.5">Agent: {c.agents.full_name}</p>
                          )}
                        </div>
                        <div className="flex flex-col items-end gap-1.5 flex-none">
                          <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${stageColor(c.status || 'new')}`}>
                            {stageLabel(c.status || 'new')}
                          </span>
                          <ChevronRight size={16} className="text-slate-600" />
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
                {hasMore && (
                  <button onClick={loadMore} disabled={searching}
                    className="w-full py-3 text-indigo-400 text-sm font-bold border-t border-slate-800 hover:bg-slate-800 transition-colors disabled:opacity-50">
                    {searching ? 'Loading...' : 'Load More'}
                  </button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      <AddCandidateModal
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onSaved={() => {
          setShowAdd(false)
          fetchCandidates(search, filterStage, 0)
          fetchStageCounts()
        }}
      />

      {selected && (
        <CandidateDetail
          candidate={selected}
          onClose={() => {
            setSelected(null)
            fetchCandidates(search, filterStage, 0)
            fetchStageCounts()
          }}
        />
      )}
    </>
  )
}
