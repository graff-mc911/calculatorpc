import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { checkIsAppOwner, clearOwnerAccessCache } from '../lib/ownerAccess';

interface OwnerRouteProps {
  children: React.ReactNode;
}

/** Auth + server-backed owner gate. Non-owners redirect Home. */
export const OwnerRoute: React.FC<OwnerRouteProps> = ({ children }) => {
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const evaluate = async () => {
      const { data } = await supabase.auth.getSession();
      const session = data.session;
      if (!session?.user) {
        if (!cancelled) {
          setAllowed(false);
          setLoading(false);
        }
        return;
      }
      const isOwner = await checkIsAppOwner(session.user.id);
      if (!cancelled) {
        setAllowed(isOwner);
        setLoading(false);
      }
    };

    void evaluate();

    const { data: authListener } = supabase.auth.onAuthStateChange(() => {
      clearOwnerAccessCache();
      setLoading(true);
      void evaluate();
    });

    return () => {
      cancelled = true;
      authListener.subscription.unsubscribe();
    };
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1e272e] flex items-center justify-center">
        <div className="text-white text-xl">Завантаження...</div>
      </div>
    );
  }

  if (!allowed) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
};
