import { createContext, useContext, useState, ReactNode } from 'react';
import { useAuth } from '@/lib/auth';

interface AdminSimulationContextType {
  simulateNonAdmin: boolean;
  setSimulateNonAdmin: (value: boolean) => void;
  /** Use this instead of isAdmin from useAuth() in UI components */
  displayIsAdmin: boolean;
}

const AdminSimulationContext = createContext<AdminSimulationContextType | undefined>(undefined);

export function AdminSimulationProvider({ children }: { children: ReactNode }) {
  const { isAdmin } = useAuth();
  const [simulateNonAdmin, setSimulateNonAdmin] = useState(false);

  const displayIsAdmin = isAdmin && !simulateNonAdmin;

  return (
    <AdminSimulationContext.Provider value={{ simulateNonAdmin, setSimulateNonAdmin, displayIsAdmin }}>
      {children}
    </AdminSimulationContext.Provider>
  );
}

export function useAdminSimulation() {
  const context = useContext(AdminSimulationContext);
  if (context === undefined) {
    throw new Error('useAdminSimulation must be used within an AdminSimulationProvider');
  }
  return context;
}
