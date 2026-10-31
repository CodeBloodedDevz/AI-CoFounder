import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import './StatCard.css';

export default function StatCard({ label, value, icon: Icon, color = 'purple', trend, trendLabel }) {
  const trendIcon =
    trend > 0 ? <TrendingUp size={12} /> :
    trend < 0 ? <TrendingDown size={12} /> :
    <Minus size={12} />;
  const trendClass =
    trend > 0 ? 'stat-card__trend--up' :
    trend < 0 ? 'stat-card__trend--down' :
    'stat-card__trend--flat';

  return (
    <div className={`stat-card stat-card--${color}`}>
      <div className="stat-card__header">
        <span className="stat-card__label">{label}</span>
        {Icon && <div className={`stat-card__icon stat-card__icon--${color}`}><Icon size={16} /></div>}
      </div>
      <div className="stat-card__value">{value}</div>
      {trend != null && (
        <div className={`stat-card__trend ${trendClass}`}>
          {trendIcon}
          <span>{Math.abs(trend)}% {trendLabel || 'vs last month'}</span>
        </div>
      )}
    </div>
  );
}
