// src/contexts/ModalAuthContext.tsx
import React, { createContext, useContext, useState, ReactNode } from "react";
import ModalAuth from "./ModalAuth";

interface ModalAuthContextType {
  showAuthModal: (onSuccess?: () => void) => void;
  closeAuthModal: () => void;
}

const ModalAuthContext = createContext<ModalAuthContextType | undefined>(undefined);

export const ModalAuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [successCallback, setSuccessCallback] = useState<(() => void) | null>(null); // ✅ 新增

  
  const showAuthModal = (onSuccess?: () => void) => {
    setSuccessCallback(() => onSuccess ?? null); // ✅ 存 callback
    setIsOpen(true);
  };

  const closeAuthModal = () => {
    console.log("Closing Auth Modal", isOpen);
    setIsOpen(false);
    setSuccessCallback(null); // ✅ 清空回调（防止残留）
  };

  return (
    <ModalAuthContext.Provider value={{ showAuthModal, closeAuthModal }}>
      {children}
      <ModalAuth
        isOpen={isOpen}
        onClose={closeAuthModal}
        onSuccess={successCallback ?? undefined} // ✅ 传入 callback 给 ModalAuth
      />
    </ModalAuthContext.Provider>
  );
};

export const useAuthModal = (): ModalAuthContextType => {
  const context = useContext(ModalAuthContext);
  if (!context) {
    throw new Error("useAuthModal must be used within a ModalAuthProvider");
  }
  return context;
};
