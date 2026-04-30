import { useState, useEffect } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts'
import { supabase } from '../lib/supabase'
import { useExercice } from '../hooks/useExercice'
import { fmt, groupBy } from '../lib/utils'

const COLORS_COMMISSIONS = ['#3d1a6e','#c8a84b','#1a7a4a','#c0392b','#6c3483','#1a5276','#d97706','#5a6472']

const fmtTooltip = (val) => fmt(val)

export default function Dashboard() {
  const { exerciceId, exercices, currentExercice } = useExercice()
  const [versions, setVersions] = useState([])
  const [selectedVersionIds, setSelectedVersionIds] = useState([])
  const [synthese, setSynthese] = useState([])
  const [compareExId, setCompareExId] = useState('')
  const [compareSynthese, setCompareSynthese] = useState([])
  const [compareVersions, setCompareVersions] = useState([])
  const [loading, setLoading] = useState(false)
  const [activeTab, setActiveTab] = useState('tableau')

  useEffect(() => { if (exerciceId) loadVersions() }, [exerciceId])
  useEffect(() => { if (compareExId) loadCompare(); else { setCompareSynthese([]); setCompareVersions([]) } }, [compareExId])
  useEffect(() => { if (selectedVersionIds.length) loadSynthese() }, [selectedVersionIds])

  const loadVersions = async () => {
    const { data } = await supabase.from('budget_versions').select('*').eq('exercice_id', exerciceId).order('ordre')
    setVersions(data || [])
    const ref = data?.find(v => v.est_reference) || data?.[0]
    if (ref) setSelectedVersionIds([ref.id])
  }

  const loadSynthese = async () => {
    setLoading(true)
    const { data } = await supabase.from('budget_v_synthese').select('*').eq('exercice_id', exerciceId).in('version_id', selectedVersionIds).order('commission_ordre').order('action_ordre')
    setSynthese(data || [])
    setLoading(false)
  }

  const loadCompare = async () => {
    const { data: v } = await supabase.from('budget_versions').select('*').eq('exercice_id', compareExId).order('ordre')
    setCompareVersions(v || [])
    const ref = v?.find(x => x.est_reference) || v?.[0]
    if (ref) {
      const { data: s } = await supabase.from('budget_v_synthese').select('*').eq('exercice_id', compareExId).eq('version_id', ref.id)
      setCompareSynthese(s || [])
    }
  }

  const toggleVersion = (id) => setSelectedVersionIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // Construction des données
  const actionData = {}
  const commissionOrder = {}
  synthese.forEach(row => {
    const key = row.action_id
    if (!actionData[key]) {
      actionData[key] = { action_id: row.action_id, action_libelle: row.action_libelle, action_ordre: row.action_ordre, commission_libelle: row.commission_libelle, commission_ordre: row.commission_ordre, reel: parseFloat(row.reel || 0), versions: {} }
      commissionOrder[row.commission_libelle] = row.commission_ordre
    }
    actionData[key].versions[row.version_id] = { montant: parseFloat(row.montant_version || 0), libelle: row.version_libelle, couleur: row.version_couleur }
  })

  const actions = Object.values(actionData).sort((a, b) => a.commission_ordre !== b.commission_ordre ? a.commission_ordre - b.commission_ordre : a.action_ordre - b.action_ordre)
  const grouped = groupBy(actions, 'commission_libelle')
  const commissions = Object.keys(grouped).sort((a, b) => (commissionOrder[a] || 0) - (commissionOrder[b] || 0))

  const refVersionId = versions.find(v => v.est_reference)?.id || selectedVersionIds[0]

  const totaux = selectedVersionIds.reduce((acc, vid) => {
    const v = versions.find(v => v.id === vid)
    acc[vid] = { libelle: v?.libelle || '', couleur: v?.couleur || 'var(--navy)', total: actions.reduce((s, a) => s + (a.versions[vid]?.montant || 0), 0) }
    return acc
  }, {})

  const totalReel = actions.reduce((s, a) => s + a.reel, 0)
  const totalRefBudget = totaux[refVersionId]?.total || 0
  const totalRecettesBudget = actions.filter(a => (a.versions[refVersionId]?.montant || 0) > 0).reduce((s, a) => s + (a.versions[refVersionId]?.montant || 0), 0)
  const totalDepensesBudget = actions.filter(a => (a.versions[refVersionId]?.montant || 0) < 0).reduce((s, a) => s + (a.versions[refVersionId]?.montant || 0), 0)
  const totalRecettesReel = actions.filter(a => a.reel > 0).reduce((s, a) => s + a.reel, 0)
  const totalDepensesReel = actions.filter(a => a.reel < 0).reduce((s, a) => s + a.reel, 0)

  // Données graphique par commission (barres)
  const chartCommissions = commissions.map((comm, i) => {
    const rows = grouped[comm]
    return {
      name: comm.length > 12 ? comm.slice(0, 12) + '…' : comm,
      fullName: comm,
      budget: Math.round(rows.reduce((s, a) => s + (a.versions[refVersionId]?.montant || 0), 0)),
      reel: Math.round(rows.reduce((s, a) => s + a.reel, 0)),
    }
  })

  // Données camembert dépenses par commission
  const pieDepenses = commissions.map((comm, i) => {
    const rows = grouped[comm]
    const total = rows.reduce((s, a) => s + (a.versions[refVersionId]?.montant || 0), 0)
    return { name: comm, value: Math.abs(Math.min(total, 0)), color: COLORS_COMMISSIONS[i % COLORS_COMMISSIONS.length] }
  }).filter(d => d.value > 0)

  const pieRecettes = commissions.map((comm, i) => {
    const rows = grouped[comm]
    const total = rows.reduce((s, a) => s + (a.versions[refVersionId]?.montant || 0), 0)
    return { name: comm, value: Math.max(total, 0), color: COLORS_COMMISSIONS[i % COLORS_COMMISSIONS.length] }
  }).filter(d => d.value > 0)

  // Top actions (budget abs)
  const topActions = [...actions]
    .sort((a, b) => Math.abs(b.versions[refVersionId]?.montant || 0) - Math.abs(a.versions[refVersionId]?.montant || 0))
    .slice(0, 8)
    .map(a => ({
      name: a.action_libelle.length > 20 ? a.action_libelle.slice(0, 20) + '…' : a.action_libelle,
      budget: a.versions[refVersionId]?.montant || 0,
      reel: a.reel,
    }))

  const ecartClass = (ecart) => Math.abs(ecart) < 200 ? 'good' : Math.abs(ecart) < 1000 ? 'warn' : 'bad'

  const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: 'white', border: '1px solid var(--gray200)', borderRadius: 8, padding: '10px 14px', boxShadow: 'var(--shadow-md)', fontSize: 12 }}>
        <div style={{ fontWeight: 600, color: 'var(--navy)', marginBottom: 6 }}>{payload[0]?.payload?.fullName || label}</div>
        {payload.map(p => <div key={p.name} style={{ color: p.color }}>
          {p.name} : <strong>{fmt(p.value)}</strong>
        </div>)}
      </div>
    )
  }

  return (
    <>
      <div className="page-header">
        <div><h2>Synthèse Budget vs Réel</h2><p>{currentExercice?.libelle}</p></div>
        <div className="flex gap-2" style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 12, color: 'var(--gray400)' }}>Comparer avec :</span>
          <select className="exercice-select" style={{ maxWidth: 180 }} value={compareExId} onChange={e => setCompareExId(e.target.value)}>
            <option value="">Autre exercice…</option>
            {exercices.filter(e => e.id !== exerciceId).map(ex => <option key={ex.id} value={ex.id}>{ex.code}</option>)}
          </select>
        </div>
      </div>

      <div className="page-body">
        {/* KPIs */}
        <div className="kpi-grid">
          <div className="kpi-card">
            <div className="kpi-label">Résultat Budget</div>
            <div className={`kpi-value ${totalRefBudget >= 0 ? 'positive' : 'negative'}`}>{fmt(totalRefBudget)}</div>
            <div className="kpi-sub">Rec. {fmt(totalRecettesBudget)} · Dép. {fmt(totalDepensesBudget)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Réel à date</div>
            <div className={`kpi-value ${totalReel >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel)}</div>
            <div className="kpi-sub">Rec. {fmt(totalRecettesReel)} · Dép. {fmt(totalDepensesReel)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Écart Réel / Budget</div>
            <div className={`kpi-value ${(totalReel - totalRefBudget) >= 0 ? 'positive' : 'negative'}`}>{fmt(totalReel - totalRefBudget)}</div>
            <div className="kpi-sub">{totalRefBudget !== 0 ? `${Math.round(totalReel / totalRefBudget * 100)}% réalisé` : '—'}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Taux réalisation recettes</div>
            <div className="kpi-value">{totalRecettesBudget !== 0 ? `${Math.round(totalRecettesReel / totalRecettesBudget * 100)}%` : '—'}</div>
            <div className="kpi-sub">{currentExercice?.code}</div>
          </div>
        </div>

        {/* Sélecteur versions */}
        {versions.length > 1 && (
          <div className="card" style={{ marginBottom: 16, padding: '12px 16px' }}>
            <div className="flex gap-2" style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 12, color: 'var(--gray400)', marginRight: 4 }}>Versions :</span>
              {versions.map(v => (
                <button key={v.id} onClick={() => toggleVersion(v.id)} style={{ padding: '5px 12px', borderRadius: 99, fontSize: 12, fontFamily: 'var(--font-body)', cursor: 'pointer', border: `2px solid ${v.couleur || 'var(--navy)'}`, background: selectedVersionIds.includes(v.id) ? v.couleur || 'var(--navy)' : 'transparent', color: selectedVersionIds.includes(v.id) ? '#fff' : v.couleur || 'var(--navy)', fontWeight: 500, transition: 'all .15s' }}>
                  {v.est_reference && '⭐ '}{v.libelle}
                </button>
              ))}
              {loading && <span className="text-muted">Chargement…</span>}
            </div>
          </div>
        )}

        {/* Onglets Tableau / Graphiques */}
        <div className="tabs">
          <button className={`tab ${activeTab === 'tableau' ? 'active' : ''}`} onClick={() => setActiveTab('tableau')}>📋 Tableau détaillé</button>
          <button className={`tab ${activeTab === 'graphiques' ? 'active' : ''}`} onClick={() => setActiveTab('graphiques')}>📈 Graphiques</button>
        </div>

        {/* TAB GRAPHIQUES */}
        {activeTab === 'graphiques' && (
          <>
            <div className="charts-grid">
              {/* Budget vs Réel par commission */}
              <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                <h3>Budget vs Réel par commission</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={chartCommissions} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray100)" />
                    <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'var(--gray600)' }} />
                    <YAxis tickFormatter={v => `${Math.round(v/1000)}k€`} tick={{ fontSize: 11, fill: 'var(--gray600)' }} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="budget" name="Budget" fill="var(--navy)" radius={[4,4,0,0]} />
                    <Bar dataKey="reel" name="Réel" fill="var(--gold)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Camembert dépenses */}
              <div className="chart-card">
                <h3>Répartition des dépenses budgétées</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieDepenses} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => percent > 0.04 ? `${name.slice(0,10)} ${(percent*100).toFixed(0)}%` : ''} labelLine={false} fontSize={11}>
                      {pieDepenses.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(val) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Camembert recettes */}
              <div className="chart-card">
                <h3>Répartition des recettes budgétées</h3>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieRecettes} cx="50%" cy="50%" outerRadius={90} dataKey="value" label={({ name, percent }) => percent > 0.04 ? `${name.slice(0,10)} ${(percent*100).toFixed(0)}%` : ''} labelLine={false} fontSize={11}>
                      {pieRecettes.map((d, i) => <Cell key={i} fill={d.color} />)}
                    </Pie>
                    <Tooltip formatter={(val) => fmt(val)} />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              {/* Top actions */}
              <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                <h3>Top 8 actions — Budget vs Réel</h3>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={topActions} layout="vertical" margin={{ left: 10, right: 30 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray100)" horizontal={false} />
                    <XAxis type="number" tickFormatter={v => `${Math.round(v/1000)}k€`} tick={{ fontSize: 11, fill: 'var(--gray600)' }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: 'var(--gray600)' }} width={130} />
                    <Tooltip content={<CustomTooltip />} />
                    <Legend />
                    <Bar dataKey="budget" name="Budget" fill="var(--navy)" radius={[0,4,4,0]} />
                    <Bar dataKey="reel" name="Réel" fill="var(--gold)" radius={[0,4,4,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>

              {/* Recettes vs Dépenses global */}
              <div className="chart-card" style={{ gridColumn: '1 / -1' }}>
                <h3>Recettes vs Dépenses — Budget et Réel</h3>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={[
                    { name: 'Budget', recettes: Math.round(totalRecettesBudget), depenses: Math.round(Math.abs(totalDepensesBudget)) },
                    { name: 'Réel', recettes: Math.round(totalRecettesReel), depenses: Math.round(Math.abs(totalDepensesReel)) },
                    ...(compareExId ? [{ name: exercices.find(e=>e.id===compareExId)?.code, recettes: Math.round(compareSynthese.filter(r=>parseFloat(r.reel)>0).reduce((s,r)=>s+parseFloat(r.reel),0)), depenses: Math.round(Math.abs(compareSynthese.filter(r=>parseFloat(r.reel)<0).reduce((s,r)=>s+parseFloat(r.reel),0))) }] : [])
                  ]} margin={{ top: 5, right: 20, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--gray100)" />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: 'var(--gray600)' }} />
                    <YAxis tickFormatter={v => `${Math.round(v/1000)}k€`} tick={{ fontSize: 11 }} />
                    <Tooltip formatter={(val) => fmt(val)} />
                    <Legend />
                    <Bar dataKey="recettes" name="Recettes" fill="var(--green)" radius={[4,4,0,0]} />
                    <Bar dataKey="depenses" name="Dépenses" fill="var(--red)" radius={[4,4,0,0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </>
        )}

        {/* TAB TABLEAU */}
        {activeTab === 'tableau' && (
          <div className="card">
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ minWidth: 220 }}>Action</th>
                    {selectedVersionIds.map(vid => {
                      const v = versions.find(v => v.id === vid)
                      return <th key={vid} className="right" style={{ color: v?.couleur }}>{v?.libelle}</th>
                    })}
                    <th className="right">Réel</th>
                    <th className="right">Écart</th>
                    <th style={{ width: 110 }}>Réalisation</th>
                    {compareExId && compareVersions.length > 0 && <th className="right" style={{ color: 'var(--gray400)' }}>{exercices.find(e=>e.id===compareExId)?.code}</th>}
                  </tr>
                </thead>
                <tbody>
                  {commissions.map(comm => {
                    const rows = grouped[comm]
                    const commTotaux = selectedVersionIds.reduce((acc, vid) => { acc[vid] = rows.reduce((s,a) => s+(a.versions[vid]?.montant||0),0); return acc }, {})
                    const commReel = rows.reduce((s,a) => s+a.reel, 0)
                    const commRef = commTotaux[refVersionId] || 0
                    return [
                      <tr key={`com-${comm}`} className="commission-row"><td colSpan={selectedVersionIds.length + 3 + (compareExId?1:0)}>{comm}</td></tr>,
                      ...rows.map(a => {
                        const refBudget = a.versions[refVersionId]?.montant || 0
                        const ecart = a.reel - refBudget
                        const pct = refBudget !== 0 ? Math.round(a.reel/refBudget*100) : null
                        const compareRow = compareSynthese.find(r => r.action_id === a.action_id)
                        return (
                          <tr key={a.action_id}>
                            <td style={{ paddingLeft: 22 }}>{a.action_libelle}</td>
                            {selectedVersionIds.map(vid => { const m = a.versions[vid]?.montant||0; return <td key={vid} className={`right amount ${m>0?'pos':m<0?'neg':''}`}>{m!==0?fmt(m):<span className="text-muted">—</span>}</td>})}
                            <td className={`right amount ${a.reel>0?'pos':a.reel<0?'neg':''}`}>{a.reel!==0?fmt(a.reel):<span className="text-muted">—</span>}</td>
                            <td className={`right amount ecart ${ecartClass(ecart)}`}>{(refBudget!==0||a.reel!==0)?fmt(ecart):<span className="text-muted">—</span>}</td>
                            <td>{pct!==null&&<><span className="text-muted" style={{fontSize:11}}>{pct}%</span><div className="progress-bar-wrap"><div className={`progress-bar ${pct>100?'over':pct>80?'warn':'good'}`} style={{width:`${Math.min(Math.abs(pct),100)}%`}}/></div></>}</td>
                            {compareExId && <td className="right amount text-muted">{compareRow?fmt(parseFloat(compareRow.reel||0)):'—'}</td>}
                          </tr>
                        )
                      }),
                      <tr key={`tot-${comm}`} className="subtotal-row">
                        <td style={{ paddingLeft:22, fontStyle:'italic' }}>Total {comm}</td>
                        {selectedVersionIds.map(vid=><td key={vid} className={`right amount ${commTotaux[vid]>=0?'pos':'neg'}`}>{fmt(commTotaux[vid])}</td>)}
                        <td className={`right amount ${commReel>=0?'pos':'neg'}`}>{fmt(commReel)}</td>
                        <td className={`right amount ecart ${ecartClass(commReel-commRef)}`}>{fmt(commReel-commRef)}</td>
                        <td/>
                        {compareExId&&<td className="right amount text-muted">{fmt(compareSynthese.filter(r=>rows.some(a=>a.action_id===r.action_id)).reduce((s,r)=>s+parseFloat(r.reel||0),0))}</td>}
                      </tr>
                    ]
                  })}
                  <tr className="total-row">
                    <td>TOTAL GÉNÉRAL</td>
                    {selectedVersionIds.map(vid=><td key={vid} className="right">{fmt(totaux[vid]?.total||0)}</td>)}
                    <td className="right">{fmt(totalReel)}</td>
                    <td className="right">{fmt(totalReel-totalRefBudget)}</td>
                    <td/>
                    {compareExId&&<td className="right">{fmt(compareSynthese.reduce((s,r)=>s+parseFloat(r.reel||0),0))}</td>}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
