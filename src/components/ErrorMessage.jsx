// src/components/ErrorMessage.jsx
import { AlertCircle } from 'lucide-react';
import './ErrorMessage.css';

export default function ErrorMessage({ message }) {
  return (
    <div className="error-msg" role="alert">
      <AlertCircle size={16} />
      {message || 'Something went wrong.'}
    </div>
  );
}
