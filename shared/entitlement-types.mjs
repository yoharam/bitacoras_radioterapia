export const ENTITLEMENT_TYPES = [
  { code: '10', name: 'Trabajador' },
  { code: '20', name: 'Trabajadora' },
  { code: '30', name: 'Esposa' },
  { code: '31', name: 'Concubina' },
  { code: '32', name: 'Mujer' },
  { code: '40', name: 'Esposo' },
  { code: '41', name: 'Concubino' },
  { code: '42', name: 'Hombre' },
  { code: '50', name: 'Padre' },
  { code: '51', name: 'Abuelo' },
  { code: '60', name: 'Madre' },
  { code: '61', name: 'Abuela' },
  { code: '70', name: 'Hijo' },
  { code: '71', name: 'Hijo de Cónyuge' },
  { code: '80', name: 'Hija' },
  { code: '81', name: 'Hija de Cónyuge' },
  { code: '90', name: 'Pensionado' },
  { code: '91', name: 'Pensionada' },
  { code: '92', name: 'Familiar de Pensionado' },
  { code: '95', name: 'IMSS BIENESTAR Hombre' },
  { code: '96', name: 'IMSS BIENESTAR Mujer' },
  { code: '97', name: 'IMSS HOMBRE' },
  { code: '98', name: 'IMSS MUJER' },
  { code: '99', name: 'NO DERECHOHABIENTE' }
];

export function entitlementLabel(code) {
  const type = ENTITLEMENT_TYPES.find(item => item.code === code);
  return type ? `${type.code} · ${type.name}` : 'Sin registrar';
}

const normalize = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export function searchEntitlementTypes(query) {
  const words = normalize(query.trim()).split(/\s+/).filter(Boolean);
  return ENTITLEMENT_TYPES.filter(type => {
    const text = normalize(`${type.code} ${type.name}`);
    return words.every(word => text.includes(word));
  });
}
