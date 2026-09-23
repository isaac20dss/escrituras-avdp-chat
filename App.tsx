import React, { useState } from 'react';
import { HashRouter, Routes, Route, Link } from 'react-router-dom';
import ControlPanel from './components/ControlPanel';
import DisplayOutput from './components/DisplayOutput';
import { Copy, ExternalLink, Check } from 'lucide-react';

// Simple Home screen to direct users
const Home = () => {
  const [copied, setCopied] = useState(false);

  const handleCopyDisplayUrl = () => {
    // Construct the full URL including the hash for the display route
    const url = `${window.location.origin}${window.location.pathname}#/display`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className="min-h-screen bg-gray-900 flex flex-col items-center justify-center text-white p-8 space-y-8">
      <div className="text-center space-y-4">
        <h1 className="text-5xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-600">
          OBS Glass Teleprompter
        </h1>
        <p className="text-gray-400 max-w-md mx-auto">
          A professional browser source tool for OBS Studio.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 w-full max-w-4xl">
        {/* Control Panel Card */}
        <Link to="/control" className="group relative block p-8 bg-gray-800 rounded-2xl border border-gray-700 hover:border-blue-500 transition-all hover:scale-[1.02] shadow-xl">
          <div className="absolute top-4 right-4 text-gray-500 group-hover:text-blue-500">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-white">Operator Control</h2>
          <p className="text-gray-400 text-sm mb-4">Use this view to select scripts, toggle visibility, and control scroll speed.</p>
          <div className="mt-4 inline-flex items-center text-blue-400 text-sm font-semibold">
             Open Panel
          </div>
        </Link>

        {/* Display Output Card */}
        <div className="group relative flex flex-col p-8 bg-black/40 backdrop-blur rounded-2xl border border-gray-700 hover:border-green-500 transition-all hover:scale-[1.02] shadow-xl">
          <div className="absolute top-4 right-4 text-gray-500 group-hover:text-green-500">
            <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-2xl font-bold mb-2 text-white">Display Output</h2>
          <p className="text-gray-400 text-sm mb-6">
            <strong>OBS Browser Source URL.</strong><br/>
            Transparent background. Animated entry/exit.
          </p>
          
          <div className="mt-auto grid grid-cols-2 gap-3">
            <Link 
              to="/display" 
              target="_blank"
              className="flex items-center justify-center gap-2 py-2 px-4 bg-gray-700 hover:bg-gray-600 rounded-lg text-sm font-semibold transition-colors"
            >
              <ExternalLink size={16} /> Open
            </Link>
            <button 
              onClick={handleCopyDisplayUrl}
              className={`flex items-center justify-center gap-2 py-2 px-4 rounded-lg text-sm font-semibold transition-colors border ${
                copied 
                  ? 'bg-green-500/20 border-green-500 text-green-400' 
                  : 'bg-gray-800 hover:bg-gray-700 border-gray-600 text-gray-300'
              }`}
            >
              {copied ? <Check size={16} /> : <Copy size={16} />}
              {copied ? 'Copied!' : 'Copy URL'}
            </button>
          </div>
        </div>
      </div>
      
      <div className="text-gray-500 text-xs max-w-lg text-center">
        <strong>Tip:</strong> In OBS Browser Source properties, ensure you clear the "Custom CSS" field and set Width/Height to match your canvas (e.g., 1920x1080).
      </div>
    </div>
  );
};

const App: React.FC = () => {
  return (
    <HashRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/control" element={<ControlPanel />} />
        <Route path="/display" element={<DisplayOutput />} />
      </Routes>
    </HashRouter>
  );
};

export default App;