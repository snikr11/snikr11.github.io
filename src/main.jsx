import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import './app.css'   // <-- keep this line

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
