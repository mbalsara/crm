import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from '@/components/theme-provider'
import { QueryProvider } from '@/lib/providers/query-provider'
import { Toaster } from '@/components/ui/sonner'
import App from './App'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import '@/app/globals.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter>
      <QueryProvider>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
          <App />
          <Toaster />
        </ThemeProvider>
      </QueryProvider>
    </BrowserRouter>
  </React.StrictMode>
)
