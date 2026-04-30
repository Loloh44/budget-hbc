import { HashRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom'
import { ExerciceProvider, useExercice } from './hooks/useExercice'
import Dashboard from './pages/Dashboard'
import Budget from './pages/Budget'
import Versions from './pages/Versions'
import Reel from './pages/Reel'
import Import from './pages/Import'
import Referentiel from './pages/Referentiel'
import Exercices from './pages/Exercices'

function Sidebar() {
  const { exercices, exerciceId, setExerciceId } = useExercice()
  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>Budget HBC</h1>
        <span>La Fillière</span>
      </div>
      <div style={{ padding: '12px 16px', borderBottom: '1px solid rgba(255,255,255,.08)' }}>
        <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: '.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,.28)', marginBottom: 6 }}>Exercice</div>
        <select
          style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid rgba(255,255,255,.15)', background: 'rgba(255,255,255,.07)', color: 'rgba(255,255,255,.85)', fontSize: 13, fontFamily: 'var(--font-body)', cursor: 'pointer' }}
          value={exerciceId || ''}
          onChange={e => setExerciceId(e.target.value)}
        >
          {exercices.map(ex => (
            <option key={ex.id} value={ex.id} style={{ background: '#0f1f3d' }}>{ex.code} — {ex.libelle}</option>
          ))}
        </select>
      </div>
      <nav className="sidebar-nav">
        <div className="nav-section-label">Tableau de bord</div>
        <NavLink to="/dashboard" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">📊</span> Synthèse
        </NavLink>
        <div className="nav-section-label">Budget</div>
        <NavLink to="/versions" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">🗂️</span> Versions & simulations
        </NavLink>
        <NavLink to="/budget" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">📋</span> Lignes budgétaires
        </NavLink>
        <div className="nav-section-label">Suivi réel</div>
        <NavLink to="/reel" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">💳</span> Écritures
        </NavLink>
        <NavLink to="/import" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">⬆️</span> Import BasiCompta
        </NavLink>
        <div className="nav-section-label">Configuration</div>
        <NavLink to="/referentiel" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">🏷️</span> Référentiel actions
        </NavLink>
        <NavLink to="/exercices" className={({ isActive }) => 'nav-link' + (isActive ? ' active' : '')}>
          <span className="icon">📅</span> Exercices
        </NavLink>
      </nav>
    </aside>
  )
}

function AppInner() {
  const { loading } = useExercice()
  if (loading) return <div className="loading" style={{ marginLeft: 230, paddingTop: 80 }}>Chargement…</div>
  return (
    <div className="app-layout">
      <Sidebar />
      <main className="main-content">
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/versions" element={<Versions />} />
          <Route path="/budget" element={<Budget />} />
          <Route path="/reel" element={<Reel />} />
          <Route path="/import" element={<Import />} />
          <Route path="/referentiel" element={<Referentiel />} />
          <Route path="/exercices" element={<Exercices />} />
        </Routes>
      </main>
    </div>
  )
}

export default function App() {
  return (
    <ExerciceProvider>
      <HashRouter>
        <AppInner />
      </HashRouter>
    </ExerciceProvider>
  )
}
