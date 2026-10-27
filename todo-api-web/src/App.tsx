import { Navigate, Route, Routes } from 'react-router-dom'
import { ProtectedRoute } from './components/ProtectedRoute'
import { LoginPage } from './pages/LoginPage'
import { RegisterPage } from './pages/RegisterPage'
import { TodosPage } from './pages/TodosPage'
import { AssistantPage } from './pages/AssistantPage'

export default function App() {
  const authenticated = Boolean(localStorage.getItem('todo_token'))

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route
        path="/todos"
        element={
          <ProtectedRoute>
            <TodosPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/assistant"
        element={
          <ProtectedRoute>
            <AssistantPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to={authenticated ? '/todos' : '/login'} replace />} />
    </Routes>
  )
}
