export function normCode(s: string): string {
  const m = /^([A-Za-z])\s*0*(\d{1,2})$/.exec(String(s).trim());
  return m ? m[1].toUpperCase() + m[2].padStart(2, '0') : String(s).trim().toUpperCase();
}
