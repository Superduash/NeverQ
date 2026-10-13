import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';

export function RequireStaff() {
  const token = localStorage.getItem('nq-staff-token');

  if (!token) {
    return <Navigate to="/staff/login" replace />;
  }

  return <Outlet />;
}

export function RequireAdmin() {
  const token = localStorage.getItem('nq-admin-token');

  if (!token) {
    return <Navigate to="/admin/login" replace />;
  }

  return <Outlet />;
}
