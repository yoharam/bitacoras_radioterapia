import { sileo } from 'sileo';

export const notifySuccess = message => sileo.success({ title: message });
export const notifyError = message => sileo.error({ title: 'No se pudo completar la acción', description: message });
