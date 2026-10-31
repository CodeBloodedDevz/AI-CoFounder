// src/components/Table.jsx
import './Table.css';

export default function Table({ columns, rows, emptyMessage = 'No data found.' }) {
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>{columns.map(c => <th key={c.key}>{c.label}</th>)}</tr>
        </thead>
        <tbody>
          {rows.length === 0
            ? <tr><td colSpan={columns.length} className="table__empty">{emptyMessage}</td></tr>
            : rows.map((row, i) => (
                <tr key={row.id ?? i}>
                  {columns.map(c => <td key={c.key}>{c.render ? c.render(row) : row[c.key]}</td>)}
                </tr>
              ))
          }
        </tbody>
      </table>
    </div>
  );
}
