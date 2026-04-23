export const isProduction = import.meta.env.VITE_NODE_ENV === 'production' || import.meta.env.PROD
let baseURL = import.meta.env.BASE_URL || '/'
baseURL = baseURL.endsWith('/') ? baseURL.slice(0, -1) : baseURL
export const prependBaseUrl = (url: string): string =>
  isProduction ? `${baseURL}/${url.replace(/^\//, '')}` : url

export const repeat = (n: number, callback: (_: any, i: number) => string): string[] =>
  [...new Array(n)].map(callback)

export const mobileCheck = () => {
  let check = false;
  (function(a) {
    if (/(android|bb\d+|meego).+mobile|avantgo|bada\/|blackberry|blazer|compal|elaine|fennec|hiptop|iemobile|ip(hone|od)|iris|kindle|lge |maemo|midp|mmp|mobile.+firefox|netfront|opera m(ob|in)i|palm( os)?|phone|p(ixi|re)\/|plucker|pocket|psp|series(4|6)0|symbian|treo|up\.(browser|link)|vodafone|wap|windows ce|xda|xiino/i.test(a)) check = true
  })(navigator.userAgent || navigator.vendor || (window as any).opera)
  return check
}

export const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t
export const damp = (a: number, b: number, lambda: number, dt: number) =>
  lerp(a, b, 1 - Math.exp(-lambda * dt))
