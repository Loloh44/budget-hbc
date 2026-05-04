import { useState, useEffect } from 'react'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, ReferenceLine, Cell, Legend
} from 'recharts'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt } from '../lib/utils'

const COLORS = ['#3d1a6e','#c8a84b','#1a7a4a','#c0392b','#6c3483','#1a5276','#d97706','#5a6472']

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null
  return (
    <div style={{ background: 'white', border: '1px solid var(--gray200)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: 12, minWidth: 160 }}>
      <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>{label}</div>
      {payload.map(p => (
        <div key={p.name} style={{ color: p.color || (p.value >= 0 ? 'var(--green)' : 'var(--red)'), marginBottom: 2 }}>
          {p.name} : <strong>{fmt(p.value)}</strong>
        </div>
      ))}
    </div>
  )
}

export default function Resultats() {
  const { exerciceId, currentExercice } = useExercice()
  const [commissions, setCommissions] = useState([])
  const [actions, setActions] = useState([])
  const [versions, setVersions] = useState([])
  const [synthese, setSynthese] = useState([])   // rows v_synthese (budget ref)
  const [ecritures, setEcritures] = useState([]) // totaux réel par action

  // Filtres
  const [selectedComm, setSelectedComm] = useState('all')
  const [mode, setMode] = useState('reel')        // 'reel' | 'compare'
  const [versionId, setVersionId] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => { if (exerciceId) loadAll() }, [exerciceId])

  const loadAll = async () => {
    setLoading(true)
    const [{ data: comm }, { data: act }, { data: ver }, { data: ecr }] = await Promise.all([
      supabase.from('budget_commissions').select('*').order('ordre'),
      supabase.from('budget_actions').select('*, budget_commissions(libelle, ordre)').eq('est_actif', true).order('ordre'),
      supabase.from('budget_versions').select('*').eq('exercice_id', exerciceId).order('ordre'),
      supabase.from('budget_ecritures').select('action_id, montant').eq('exercice_id', exerciceId),
    ])
    setCommissions(comm || [])
    setActions(act || [])
    setVersions(ver || [])
    setEcritures(ecr || [])
    // Version référence par défaut
    const ref = ver?.find(v => v.est_reference) || ver?.[0]
    if (ref) {
      setVersionId(ref.id)
      loadSynthese(ref.id)
    }
    setLoading(false)
  }

  const loadSynthese = async (vid) => {
    if (!vid) return
    const { data } = await supabase
      .from('budget_v_synthese')
      .select('*')
      .eq('exercice_id', exerciceId)
      .eq('version_id', vid)
    setSynthese(data || [])
  }

  const handleVersionChange = (vid) => {
    setVersionId(vid)
    loadSynthese(vid)
  }

  // Calcul réel par action (agrégé côté client)
  const reelByAction = {}
  ecritures.forEach(e => {
    if (!reelByAction[e.action_id]) reelByAction[e.action_id] = 0
    reelByAction[e.action_id] += parseFloat(e.montant || 0)
  })

  // Budget par action depuis synthese
  const budgetByAction = {}
  synthese.forEach(row => { budgetByAction[row.action_id] = parseFloat(row.montant_version || 0) })

  // Filtrer les commissions à afficher
  const commsToShow = selectedComm === 'all'
    ? commissions
    : commissions.filter(c => c.id === selectedComm)

  // Construire les données par commission
  const buildCommData = (comm) => {
    const actionsComm = actions.filter(a => a.commission_id === comm.id)
    return actionsComm.map(a => ({
      name: a.libelle.length > 18 ? a.libelle.slice(0, 18) + '…' : a.libelle,
      fullName: a.libelle,
      reel: Math.round((reelByAction[a.id] || 0) * 100) / 100,
      budget: Math.round((budgetByAction[a.id] || 0) * 100) / 100,
    })).filter(d => d.reel !== 0 || d.budget !== 0)
  }

  const commResultat = (comm) => {
    const acts = actions.filter(a => a.commission_id === comm.id)
    const reel = acts.reduce((s, a) => s + (reelByAction[a.id] || 0), 0)
    const budget = acts.reduce((s, a) => s + (budgetByAction[a.id] || 0), 0)
    return { reel, budget, ecart: reel - budget }
  }

  // KPIs globaux
  const totalReel = Object.values(reelByAction).reduce((s, v) => s + v, 0)
  const totalBudget = synthese.reduce((s, r) => s + parseFloat(r.montant_version || 0), 0)
  const totalRecettes = Object.values(reelByAction).filter(v => v > 0).reduce((s, v) => s + v, 0)
  const totalDepenses = Object.values(reelByAction).filter(v => v < 0).reduce((s, v) => s + v, 0)

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Résultats par commission</h2>
          <p>{currentExercice?.libelle}</p>
        </div>
      </div>

      <div className="page-body">

        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Résultat réel global</div>
            <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
            <div className="kpi-sub">Rec. {fmt(totalRecettes)} · Dép. {fmt(totalDepenses)}</div>
          </div>
          {mode === 'compare' && (
            <div className="kpi-card">
              <div className="kpi-label">Budget ({versions.find(v => v.id === versionId)?.libelle})</div>
              <div className={`kpi-value ${totalBudget >= 0 ? 'positive' : 'negative'}`}>{fmt(totalBudget)}</div>
              <div className="kpi-sub">Écart : {fmt(totalReel - totalBudget)}</div>
            </div>
          )}
          <div className="kpi-card">
            <div className="kpi-label">Commissions affichées</div>
            <div className="kpi-value">{commsToShow.length}</div>
            <div className="kpi-sub">sur {commissions.length} au total</div>
          </div>
        </div>

        {/* Barre de contrôles */}
        <div className="card" style={{ marginBottom: 20, padding: '14px 20px' }}>
          <div className="flex gap-3" style={{ alignItems: 'center', flexWrap: 'wrap' }}>

            {/* Commission */}
            <div className="form-group" style={{ minWidth: 200, margin: 0 }}>
              <label>Commission</label>
              <select value={selectedComm} onChange={e => setSelectedComm(e.target.value)}>
                <option value="all">Toutes les commissions</option>
                {commissions.map(c => <option key={c.id} value={c.id}>{c.libelle}</option>)}
              </select>
            </div>

            {/* Mode */}
            <div className="form-group" style={{ margin: 0 }}>
              <label>Affichage</label>
              <div style={{ display: 'flex', gap: 0, borderRadius: 6, overflow: 'hidden', border: '1px solid var(--gray200)' }}>
                {[['reel', '📊 Réel seul'], ['compare', '⚖️ Réel vs Budget']].map(([val, label]) => (
                  <button key={val} onClick={() => setMode(val)}
                    style={{ padding: '7px 14px', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-body)', fontSize: 12, fontWeight: mode === val ? 600 : 400, background: mode === val ? 'var(--navy)' : 'white', color: mode === val ? 'var(--gold)' : 'var(--gray600)', transition: 'all .15s' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Version (si compare) */}
            {mode === 'compare' && (
              <div className="form-group" style={{ minWidth: 200, margin: 0 }}>
                <label>Version budget</label>
                <select value={versionId} onChange={e => handleVersionChange(e.target.value)}>
                  {versions.map(v => <option key={v.id} value={v.id}>{v.est_reference ? '⭐ ' : ''}{v.libelle}</option>)}
                </select>
              </div>
            )}

            {loading && <span className="text-muted">Chargement…</span>}
          </div>
        </div>

        {/* Un bloc par commission */}
        {commsToShow.map((comm, ci) => {
          const chartData = buildCommData(comm)
          const { reel, budget, ecart } = commResultat(comm)
          if (chartData.length === 0) return null

          const hasPositive = chartData.some(d => d.reel > 0 || d.budget > 0)
          const hasNegative = chartData.some(d => d.reel < 0 || d.budget < 0)
          const domainMin = hasNegative ? 'auto' : 0
          const domainMax = hasPositive ? 'auto' : 0

          return (
            <div key={comm.id} className="card" style={{ marginBottom: 20, borderLeft: `4px solid ${COLORS[ci % COLORS.length]}` }}>
              {/* En-tête commission */}
              <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--gray100)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                  <div style={{ width: 12, height: 12, borderRadius: '50%', background: COLORS[ci % COLORS.length] }} />
                  <strong style={{ fontSize: 15, color: 'var(--navy)', fontFamily: 'var(--font-display)' }}>{comm.libelle}</strong>
                </div>
                <div className="flex gap-3" style={{ alignItems: 'center' }}>
                  {mode === 'compare' && (
                    <span style={{ fontSize: 12, color: 'var(--gray400)' }}>
                      Budget : <strong style={{ color: 'var(--navy)' }}>{fmt(budget)}</strong>
                    </span>
                  )}
                  <span style={{ fontSize: 12, color: 'var(--gray400)' }}>
                    Réel : <strong style={{ color: reel >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(reel)}</strong>
                  </span>
                  {mode === 'compare' && (
                    <span className={`badge ${ecart >= 0 ? 'badge-green' : 'badge-red'}`}>
                      Écart {fmt(ecart)}
                    </span>
                  )}
                  <span className={`badge ${reel >= 0 ? 'badge-green' : 'badge-red'}`} style={{ fontSize: 12, fontWeight: 700 }}>
                    Résultat {fmt(reel)}
                  </span>
                </div>
              </div>

              {/* Graphique */}
              <div style={{ padding: '20px 20px 8px' }}>
                <ResponsiveContainer width="100%" height={Math.max(180, chartData.length * (mode === 'compare' ? 42 : 34))}>
                  <BarChart data={chartData} layout="vertical" margin={{ left: 0, right: 30, top: 4, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray100)" horizontal={false} />
                    <XAxis
                      type="number"
                      domain={[domainMin, domainMax]}
                      tickFormatter={v => `${Math.round(v / 1000)}k€`}
                      tick={{ fontSize: 10, fill: 'var(--gray400)' }}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11, fill: 'var(--gray600)' }}
                      width={140}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {mode === 'compare' && <Legend />}
                    <ReferenceLine x={0} stroke="var(--gray400)" strokeWidth={1} />
                    {mode === 'compare' && (
                      <Bar dataKey="budget" name="Budget" fill={COLORS[ci % COLORS.length]} opacity={0.35} radius={[0, 3, 3, 0]} barSize={10} />
                    )}
                    <Bar dataKey="reel" name="Réel" radius={[0, 4, 4, 0]} barSize={mode === 'compare' ? 10 : 16}>
                      {chartData.map((d, i) => (
                        <Cell key={i} fill={d.reel >= 0 ? '#1a7a4a' : '#c0392b'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Tableau détail actions */}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Action</th>
                      <th className="right">Réel</th>
                      {mode === 'compare' && <th className="right">Budget</th>}
                      {mode === 'compare' && <th className="right">Écart</th>}
                      {mode === 'compare' && <th style={{ width: 100 }}>Réalisation</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {chartData.map(d => {
                      const ecartA = d.reel - d.budget
                      const pct = d.budget !== 0 ? Math.round(d.reel / d.budget * 100) : null
                      return (
                        <tr key={d.fullName}>
                          <td style={{ paddingLeft: 20 }}>{d.fullName}</td>
                          <td className={`right amount ${d.reel > 0 ? 'pos' : d.reel < 0 ? 'neg' : ''}`}>
                            {d.reel !== 0 ? fmt(d.reel) : <span className="text-muted">—</span>}
                          </td>
                          {mode === 'compare' && (
                            <td className={`right amount ${d.budget > 0 ? 'pos' : d.budget < 0 ? 'neg' : ''}`}>
                              {d.budget !== 0 ? fmt(d.budget) : <span className="text-muted">—</span>}
                            </td>
                          )}
                          {mode === 'compare' && (
                            <td className={`right amount ${Math.abs(ecartA) < 200 ? 'ecart good' : Math.abs(ecartA) < 1000 ? 'ecart warn' : 'ecart bad'}`}>
                              {(d.reel !== 0 || d.budget !== 0) ? fmt(ecartA) : <span className="text-muted">—</span>}
                            </td>
                          )}
                          {mode === 'compare' && (
                            <td>
                              {pct !== null && (
                                <>
                                  <span className="text-muted" style={{ fontSize: 11 }}>{pct}%</span>
                                  <div className="progress-bar-wrap">
                                    <div className={`progress-bar ${Math.abs(pct) > 100 ? 'over' : Math.abs(pct) > 80 ? 'warn' : 'good'}`}
                                      style={{ width: `${Math.min(Math.abs(pct), 100)}%` }} />
                                  </div>
                                </>
                              )}
                            </td>
                          )}
                        </tr>
                      )
                    })}
                    {/* Ligne résultat commission */}
                    <tr className="subtotal-row">
                      <td style={{ fontStyle: 'italic' }}>Total {comm.libelle}</td>
                      <td className={`right amount ${reel > 0 ? 'pos' : 'neg'}`}>{fmt(reel)}</td>
                      {mode === 'compare' && <td className={`right amount ${budget > 0 ? 'pos' : 'neg'}`}>{fmt(budget)}</td>}
                      {mode === 'compare' && <td className={`right amount ${ecart >= 0 ? 'ecart good' : 'ecart bad'}`}>{fmt(ecart)}</td>}
                      {mode === 'compare' && <td />}
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )
        })}

        {commsToShow.every(c => buildCommData(c).length === 0) && (
          <div className="card">
            <div className="empty-state">
              <div className="icon">📊</div>
              <p>Aucune donnée réelle pour cette sélection.<br />Importez d'abord le journal BasiCompta.</p>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
