// src/components/Pagination.jsx
import './Pagination.css';

export default function Pagination({ page, totalPages, onPage }) {
  if (totalPages <= 1) return null;
  return (
    <div className="pagination">
      <span>Page {page} of {totalPages}</span>
      <button className="pagination__btn" disabled={page <= 1} onClick={() => onPage(page - 1)}>‹ Prev</button>
      {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
        <button
          key={p}
          className={`pagination__btn${p === page ? ' pagination__btn--active' : ''}`}
          onClick={() => onPage(p)}
        >{p}</button>
      ))}
      <button className="pagination__btn" disabled={page >= totalPages} onClick={() => onPage(page + 1)}>Next ›</button>
    </div>
  );
}
