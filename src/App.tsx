import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/lib/auth";
import { ScoreAlertsProvider } from "@/components/ScoreAlertsProvider";
import Header from "@/components/Header";
import MobileBottomNav from "@/components/MobileBottomNav";
import ProtectedRoute from "@/components/ProtectedRoute";
import CompetitionTypeSurvey from "@/components/CompetitionTypeSurvey";
import { Loader2 } from "lucide-react";

// Lazy loaded pages for better performance
const Index = lazy(() => import("./pages/Index"));
const Auth = lazy(() => import("./pages/Auth"));
const Quiniela = lazy(() => import("./pages/Quiniela"));
const Tabla = lazy(() => import("./pages/Tabla"));
const Admin = lazy(() => import("./pages/Admin"));
const NotFound = lazy(() => import("./pages/NotFound"));

// Loading fallback component
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center">
    <Loader2 className="w-8 h-8 animate-spin text-primary" />
  </div>
);

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <ScoreAlertsProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <div className="min-h-screen has-bottom-nav">
              <Header />
              <CompetitionTypeSurvey />
              <Suspense fallback={<PageLoader />}>
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
              </Suspense>
              <MobileBottomNav />
            </div>
          </BrowserRouter>
        </ScoreAlertsProvider>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
