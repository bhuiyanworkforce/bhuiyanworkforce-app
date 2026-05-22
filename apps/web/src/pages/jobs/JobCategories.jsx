import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../context/AuthContext'
import {
  Briefcase, ChevronRight, Search,
  Plus, X, RefreshCw, Trash2
} from 'lucide-react'
import SmartPassportUpload from '../passports/SmartPassportUpload'
import CandidateDetail from '../candidates/CandidateDetail'
import { stageColor, stageLabel } from '../candidates/Candidates'

export default function JobCategories() {
  const { profile } = useAuth()
  const isAgent = profile?.role === 'agent'
  const canAdd  = !isAgent

  const [categories, setCategories]       = useState([])
  const [selected, setSelected]           = useState(null)
  const [candidates, setCandidates]       = useState([])
  const [loadingCats, setLoadingCats]     = useState(true)
  const [loadingCands, setLoadingCands]   = useState(false)
  const [search, setSearch]               = useState('')
  const [showUpload, setShowUpload]       = useState(false)
  const [openCandidate, setOpenCandidate] = useState(null)
  const [refreshing, setRefreshing]       = useState(false)
  const [unassignedCount, setUnassignedCount] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(null)

  async function handleDeleteCandidate(id) {
    await supabase.from('candidates').delete().eq('id', id)
    setConfirmDelete(null)
    fetchCategories()
    if (selected) fetchCandidates(selected.id, search)
  }

  // ── Load categories with counts ───────────────────────────
  const fetchCategories = useCallback(async () => {
    setLoadingCats(true)

    const [{ data: cats }, { data: allCands }, { count: unassigned }] = await Promise.all([
      supabase.from('job_categories').select('*').order('sort_order'),
      supabase.from('candidates').select('job_category_id').not('job_category_id', 'is', null),
      supabase.from('candidates').select('*', { count: 'exact', head: true }).is('job_category_id', null),
    ])

    const countMap = {}
    for (const c of allCands || []) {
      countMap[c.job_category_id] = (countMap[c.job_category_id] || 0) + 1
    }

    setCategories((cats || []).map(cat => ({ ...cat, candidateCount: countMap[cat.id] || 0 })))
    setUnassignedCount(unassigned || 0)
    setLoadingCats(false)
  }, [])

  useEffect(() => { fetchCategories() }, [fetchCategories])

  // ── Load candidates for selected category ─────────────────
  const fetchCandidates = useCallback(async (catId, searchTerm = '') => {
    if (!catId) { setCandidates([]); return }
    setLoadingCands(true)

    if (catId === '__unassigned__') {
      let q = supabase
        .from('candidates')
        .select('*, agents(full_name)')
        .is('job_category_id', null)
        .order('created_at', { ascending: false })
      if (searchTerm.trim()) q = q.ilike('full_name', `%${searchTerm.trim()}%`)
      const { data } = await q
      setCandidates(data || [])
    } else {
      let q = supabase
        .from('candidates')
        .select('*, agents(full_name), job_categories(name, icon, color)')
        .eq('job_category_id', catId)
        .order('created_at', { ascending: false })
      if (searchTerm.trim()) q = q.ilike('full_name', `%${searchTerm.trim()}%`)
      const { data } = await q
      setCandidates(data || [])
    }

    setLoadingCands(false)
  }, [])

  useEffect(() => {
    fetchCandidates(selected?.id, search)
  }, [selected, search, fetchCandidates])

  async function handleRefresh() {
    setRefreshing(true)
    await Promise.all([fetchCategories(), fetchCandidates(selected?.id, search)])
    setRefreshing(false)
  }

  function handleSaved() {
    fetchCategories()
    if (selected) fetchCandidates(selected.id, search)
  }

  return (
    <div className="flex flex-col gap-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            <Briefcase size={20} className="text-indigo-400" />
            Job Categories
          </h1>
          <p className="text-slate-500 text-xs mt-0.5">Workers sorted by job type</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={handleRefresh} disabled={refreshing} className="p-2 text-slate-500 hover:text-slate-300 transition-colors">
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {canAdd && (
            <button
              onClick={() => setShowUpload(true)}
              className="flex items-center gap-2 bg-gradient-to-r from-indigo-500 to-violet-600 text-white font-bold px-4 py-2.5 rounded-xl text-sm"
            >
              <Plus size={16} /> Add Worker
            </button>
          )}
        </div>
      </div>

      {/* Category grid */}
      {loadingCats ? (
        <div className="grid grid-cols-2 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-20 bg-slate-800/40 rounded-2xl animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            {categories.map(cat => {
              const count = cat.candidateCount || 0
              const isActive = selected?.id === cat.id
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelected(isActive ? null : cat)}
                  className={`
                    flex items-center gap-3 px-4 py-4 rounded-2xl border text-left transition-all
                    ${isActive
                      ? 'bg-indigo-500/15 border-indigo-500/50 shadow-lg shadow-indigo-500/10'
                      : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600'
                    }
                  `}
                >
                  <span className="text-2xl leading-none">{cat.icon}</span>
                  <div className="min-w-0">
                    <p className={`text-sm font-semibold truncate ${isActive ? 'text-indigo-200' : 'text-slate-200'}`}>
                      {cat.name}
                    </p>
                    <p className={`text-xs mt-0.5 ${isActive ? 'text-indigo-400' : 'text-slate-500'}`}>
                      {count} worker{count !== 1 ? 's' : ''}
                    </p>
                  </div>
                  {isActive && <ChevronRight size={14} className="text-indigo-400 ml-auto shrink-0" />}
                </button>
              )
            })}

            {/* Unassigned tile */}
            {unassignedCount > 0 && (
              <button
                onClick={() => setSelected(selected?.id === '__unassigned__' ? null : { id: '__unassigned__', name: 'No Category', icon: '?' })}
                className={`
                  flex items-center gap-3 px-4 py-4 rounded-2xl border text-left transition-all
                  ${selected?.id === '__unassigned__'
                    ? 'bg-amber-500/10 border-amber-500/40'
                    : 'bg-slate-800/40 border-slate-700/60 hover:border-slate-600 border-dashed'
                  }
                `}
              >
                <span className="text-2xl leading-none">?</span>
                <div>
                  <p className="text-sm font-semibold text-slate-300">No Category</p>
                  <p className="text-xs text-slate-500 mt-0.5">{unassignedCount} worker{unassignedCount !== 1 ? 's' : ''}</p>
                </div>
              </button>
            )}
          </div>

          {/* Selected category — candidate list */}
          {selected && (
            <div className="mt-2">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-bold text-slate-200 flex items-center gap-2">
                  <span className="text-xl">{selected.icon}</span>
                  {selected.name}
                </h2>
                <button onClick={() => { setSelected(null); setCandidates([]) }} className="text-slate-600 hover:text-slate-400 p-1">
                  <X size={16} />
                </button>
              </div>

              {/* Search */}
              <div className="relative mb-3">
                <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search workers..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-100 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                {search && (
                  <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500">
                    <X size={14} />
                  </button>
                )}
              </div>

              {loadingCands ? (
                <div className="flex flex-col gap-2">
                  {[1, 2, 3].map(i => (
                    <div key={i} className="h-16 bg-slate-800/40 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : candidates.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-sm">
                  {search ? 'No workers match your search' : 'No workers in this category yet'}
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {candidates.map(c => (
                    <div key={c.id} className="flex items-center gap-2 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/60 rounded-xl px-4 py-3 transition-colors">
                      <button
                        onClick={() => setOpenCandidate(c)}
                        className="flex items-center gap-3 flex-1 min-w-0 text-left"
                      >
                        <div className="w-9 h-9 rounded-full bg-indigo-500/20 border border-indigo-500/30 flex items-center justify-center shrink-0">
                          <span className="text-indigo-300 font-bold text-sm">
                            {c.full_name?.charAt(0)?.toUpperCase() || '?'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold text-slate-100 truncate">{c.full_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${stageColor(c.status)}`}>
                              {stageLabel(c.status)}
                            </span>
                            {c.agents?.full_name && (
                              <span className="text-xs text-slate-600 truncate">via {c.agents.full_name}</span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={14} className="text-slate-600 shrink-0" />
                      </button>
                      {confirmDelete === c.id ? (
                        <div className="flex flex-col items-end gap-1 shrink-0">
                          <button onClick={() => handleDeleteCandidate(c.id)} className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded-full font-semibold">Delete</button>
                          <button onClick={() => setConfirmDelete(null)} className="text-xs text-slate-600 px-2 py-0.5">Cancel</button>
                        </div>
                      ) : (
                        <button onClick={() => setConfirmDelete(c.id)} className="text-slate-600 hover:text-red-400 transition-colors p-1 shrink-0">
                          <Trash2 size={15}/>
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}

      <SmartPassportUpload
        open={showUpload}
        onClose={() => setShowUpload(false)}
        onSaved={handleSaved}
      />

      {openCandidate && (
        <CandidateDetail
          candidate={openCandidate}
          onClose={() => setOpenCandidate(null)}
        />
      )}
    </div>
  )
}
