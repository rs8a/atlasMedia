const fs = require('fs-extra');
const path = require('path');
const constants = require('../config/constants');
const logger = require('./logger');

/**
 * Asegura que existe una carpeta para un canal
 */
async function ensureChannelDirectory(channelId) {
  const channelPath = path.join(constants.MEDIA_BASE_PATH, channelId);
  try {
    await fs.ensureDir(channelPath);
    return channelPath;
  } catch (error) {
    logger.error(`Error creando directorio para canal ${channelId}:`, error);
    throw error;
  }
}

/**
 * Limpia los archivos de un canal
 */
async function cleanChannelDirectory(channelId) {
  const channelPath = path.join(constants.MEDIA_BASE_PATH, channelId);
  try {
    if (await fs.pathExists(channelPath)) {
      await fs.emptyDir(channelPath);
      logger.info(`Directorio limpiado para canal ${channelId}`);
    }
  } catch (error) {
    logger.error(`Error limpiando directorio para canal ${channelId}:`, error);
    throw error;
  }
}

/**
 * Elimina el directorio completo de un canal
 */
async function removeChannelDirectory(channelId) {
  const channelPath = path.join(constants.MEDIA_BASE_PATH, channelId);
  try {
    if (await fs.pathExists(channelPath)) {
      await fs.remove(channelPath);
      logger.info(`Directorio eliminado para canal ${channelId}`);
    }
  } catch (error) {
    logger.error(`Error eliminando directorio para canal ${channelId}:`, error);
    throw error;
  }
}

/**
 * Obtiene la ruta completa de un archivo de salida para un canal
 */
function getChannelOutputPath(channelId, filename) {
  return path.join(constants.MEDIA_BASE_PATH, channelId, filename);
}

module.exports = {
  ensureChannelDirectory,
  cleanChannelDirectory,
  removeChannelDirectory,
  getChannelOutputPath
};

