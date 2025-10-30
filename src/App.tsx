import { BrowserRouter, Routes, Route } from "react-router-dom";
import { WalletContextProvider } from "./contexts/WalletContextProvider";
import { Navbar } from "./components/Navbar";
import { Home } from "./pages/Home";
import { CreateMarket } from "./pages/CreateMarket";
import { Claim } from "./pages/Claim";

function App() {
  return (
    <WalletContextProvider>
      <BrowserRouter>
        <div className="min-h-screen bg-background dark">
          <Navbar />
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/create" element={<CreateMarket />} />
            <Route path="/claim" element={<Claim />} />
          </Routes>
          <footer className="border-t border-border mt-16 py-6">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-sm text-muted-foreground">
              © 2025. Made using <span className="text-purple-500">AImpact</span>
            </div>
          </footer>
        </div>
      </BrowserRouter>
    </WalletContextProvider>
  );
}

export default App;
