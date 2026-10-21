const qtyFmt = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 3 });
const moneyFmt = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const dateFmt = new Intl.DateTimeFormat('es-MX', { dateStyle: 'medium', timeStyle: 'short' });

export const fmtQty = (n: number | null | undefined) => (n == null ? '—' : qtyFmt.format(n));
export const fmtMoney = (n: number | null | undefined) => (n == null ? '—' : moneyFmt.format(n));
export const fmtDate = (iso: string) => dateFmt.format(new Date(iso));
