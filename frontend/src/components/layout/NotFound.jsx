import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from '../ui/index.js';
import { MapPin } from 'lucide-react';

export function NotFound() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
      <div className="w-16 h-16 rounded-3xl bg-[var(--surface-2)] text-[var(--brand)] flex items-center justify-center mb-4 shadow-sm">
        <MapPin size={32} />
      </div>
      <h1 className="font-heading font-extrabold text-2xl text-[var(--ink)] mb-2">
        Page Not Found
      </h1>
      <p className="text-xs text-[var(--ink-faint)] max-w-sm mb-6 leading-relaxed">
        The queue ticket or hospital page you are looking for does not exist or has expired.
      </p>
      <Link to="/">
        <Button variant="primary">Return to Discovery Map</Button>
      </Link>
    </div>
  );
}
