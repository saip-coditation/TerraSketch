import React from "react";

export default function LoadingSpinner({ size = 18, className = "" }) {
  const style = { width: size, height: size };
  return (
    <span
      role="status"
      aria-label="Loading"
      className={`inline-block animate-spin rounded-full border-2 border-white/20 border-t-brand-400 ${className}`}
      style={style}
    />
  );
}
