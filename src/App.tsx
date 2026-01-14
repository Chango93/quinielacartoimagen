import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ScoreAlertsProvider } from "@/components/ScoreAlertsProvider";
import Header from "@/components/Header";
import ProtectedRoute from "@/components/ProtectedRoute";
import CompetitionTypeSurvey from "@/components/CompetitionTypeSurvey";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import Quiniela from "./pages/Quiniela";
import Tabla from "./pages/Tabla";
import Admin from "./pages/Admin";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <ScoreAlertsProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen">
              <Header />
              <CompetitionTypeSurvey />
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/auth" element={<Auth />} />
                <Route 
                  path="/quiniela" 
                  element={
                    <ProtectedRoute>
                      <Quiniela />
                    </ProtectedRoute>
                  } 
                />
                <Route path="/tabla" element={<Tabla />} />
                <Route 
                  path="/admin" 
                  element={
                    <ProtectedRoute requireAdmin>
                      <Admin />
                    </ProtectedRoute>
                  } 
                />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </div>
          </BrowserRouter>
        </ScoreAlertsProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
