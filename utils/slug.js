/**
 * Convierte un nombre de canal a un slug URL-friendly
 * @param {string} name - Nombre del canal
 * @returns {string} - Slug normalizado
 */
function nameToSlug(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD') // Normaliza caracteres con acentos
    .replace(/[\u0300-\u036f]/g, '') // Elimina diacríticos
    .replace(/[^a-z0-9]+/g, '-') // Reemplaza caracteres no alfanuméricos con guiones
    .replace(/^-+|-+$/g, ''); // Elimina guiones al inicio y final
}

/**
 * Normaliza un nombre para comparación (similar a slug pero sin reemplazar espacios)
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

module.exports = {
  nameToSlug,
  normalizeName
};

