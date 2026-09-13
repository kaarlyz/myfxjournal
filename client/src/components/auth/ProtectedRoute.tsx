import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAF9F6] flex items-center justify-center font-mono">
        <div className="p-4 bg-white border-2 border-[#121212] shadow-[4px_4px_0px_0px_#121212] rounded flex items-center gap-2 text-xs font-black">
          <span className="w-2.5 h-2.5 rounded-full bg-[#1040C0] animate-pulse" />
          <span>VERIFYING SESSION...</span>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/landing" state={{ from: location, openAuth: true }} replace />;
  }

  return <>{children}</>;
}
