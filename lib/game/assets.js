// Vite replaces BASE_URL at build time; relative URLs also work under /sgs/.
export const assetUrl = path => `${import.meta.env?.BASE_URL ?? '/'}${path.replace(/^\/+/, '')}`;
