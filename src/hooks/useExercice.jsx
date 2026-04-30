import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'

const ExerciceContext = createContext(null)

export function ExerciceProvider({ children }) {
  const [exercices, setExercices] = useState([])
  const [exerciceId, setExerciceId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadExercices()
  }, [])

  const loadExercices = async () => {
    const { data } = await supabase
      .from('budget_exercices')
      .select('*')
      .order('date_debut', { ascending: false })
    if (data) {
      setExercices(data)
      const actif = data.find(e => e.est_actif) || data[0]
      if (actif) setExerciceId(actif.id)
    }
    setLoading(false)
  }

  const currentExercice = exercices.find(e => e.id === exerciceId)

  return (
    <ExerciceContext.Provider value={{ exercices, exerciceId, setExerciceId, currentExercice, loading, reload: loadExercices }}>
      {children}
    </ExerciceContext.Provider>
  )
}

export const useExercice = () => useContext(ExerciceContext)
