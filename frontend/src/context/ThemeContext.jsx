import React, { createContext, useContext, useEffect } from "react";

const ThemeContext = createContext({ theme: "dark", toggle: () => {} });

// Dark mode only — light mode was removed.
export function ThemeProvider({ children }) {
  useEffect(() => {
    document.documentElement.classList.remove("light");
    try {
      localStorage.setItem("terrasketch.theme", "dark");
    } catch {}
  }, []);

  return (
    <ThemeContext.Provider value={{ theme: "dark", toggle: () => {} }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
