export const getEnv = () => {
    const backendUrl = import.meta.env.VITE_BACKEND_API_URL;
    const frontendUrl = import.meta.env.VITE_FRONTEND_URL;
    const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID;

    const paypalClientId = import.meta.env.VITE_PAYPAL_CLIENT_ID;
  
    if (!backendUrl) throw new Error("VITE_BACKEND_API_URL is missing in .env");
    if (!frontendUrl) throw new Error("VITE_FRONTEND_URL is missing in .env");
    if (!googleClientId) throw new Error("VITE_GOOGLE_CLIENT_ID is missing in .env");
    if (!paypalClientId) throw new Error("VITE_PAYPAL_CLIENT_ID is missing in .env");

    return {
      backendUrl,
      frontendUrl,
      googleClientId,
      paypalClientId,
    };
};
  