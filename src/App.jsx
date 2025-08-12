import React, { useState } from 'react'
import * as XLSX from 'xlsx'

export default function App() {
  const [rows, setRows] = useState([])

  function loadSample() {
    fetch('/demo-plan.xlsx')
      .then(res => res.arrayBuffer())
      .then(data => {
        const wb = XLSX.read(data, {type:'array'})
        const ws = wb.Sheets[wb.SheetNames[0]]
        const json = XLSX.utils.sheet_to_json(ws)
        setRows(json)
      })
  }

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Daily Training Checklist</h1>
      <div className="flex gap-2 mb-4">
        <button onClick={loadSample} className="bg-blue-500 text-white px-3 py-1 rounded">Load Sample Plan</button>
      </div>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-200">
            {rows[0] && Object.keys(rows[0]).map((key) => (
              <th key={key} className="border px-2 py-1">{key}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="border-b">
              {Object.values(row).map((val, j) => (
                <td key={j} className="border px-2 py-1">{val}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
