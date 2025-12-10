import { Routes, Route, Navigate } from 'react-router-dom'
import DashboardPage from '@/app/page'
import CustomersPage from '@/app/customers/page'
import EmployeesPage from '@/app/employees/page'
import EscalationsPage from '@/app/escalations/page'
import SettingsPage from '@/app/settings/page'

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<DashboardPage />} />
      <Route path="/customers" element={<CustomersPage />} />
      <Route path="/employees" element={<EmployeesPage />} />
      <Route path="/escalations" element={<EscalationsPage />} />
      <Route path="/settings" element={<SettingsPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
