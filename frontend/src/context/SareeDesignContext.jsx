import { createContext, useContext, useState, useCallback } from 'react';

// Holds lightweight references (object URLs / static paths) to the saree
// component images so the Simulation page can assemble them client-side,
// without re-uploading, re-fetching or re-generating anything.
const SareeDesignContext = createContext(null);

export function SareeDesignProvider({ children }) {
  const [assets, setAssetsState] = useState({
    bodyImage: null, borderImage: null, palluImage: null,
    assetNames: {}, style: 'normal', description: '',
  });

  const setAssets = useCallback((next) => {
    setAssetsState((prev) => ({ ...prev, ...next }));
  }, []);

  return (
    <SareeDesignContext.Provider value={{ assets, setAssets }}>
      {children}
    </SareeDesignContext.Provider>
  );
}

export function useSareeDesign() {
  const ctx = useContext(SareeDesignContext);
  if (!ctx) throw new Error('useSareeDesign must be used inside SareeDesignProvider');
  return ctx;
}
