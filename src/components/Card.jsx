// src/components/Card.jsx
import './Card.css';

export default function Card({ title, action, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {(title || action) && (
        <div className="card__header">
          {title && <h3 className="card__title">{title}</h3>}
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
