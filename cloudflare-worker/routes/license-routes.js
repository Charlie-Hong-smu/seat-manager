export function createLicensePostRoutes(handlers) {
  return {
    "/license/auth": handlers.auth,
    "/license/unbind-device": handlers.unbindDevice,
  };
}
