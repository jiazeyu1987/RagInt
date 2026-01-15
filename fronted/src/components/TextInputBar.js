import React from 'react';

export function TextInputBar({ onSubmit, children }) {
  return (
    <form className="text-input text-input-minimal" onSubmit={onSubmit}>
      {children}
    </form>
  );
}

