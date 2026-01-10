const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const constants = require('../config/constants');
const logger = require('../utils/logger');

class GPUDetectionService {
  constructor() {
    // Cache para resultados de detección
    this._detectionCache = null;
    this._cacheTimestamp = null;
    this._cacheTTL = 60000; // 60 segundos de cache
  }

  /**
   * Detecta todas las GPUs disponibles en el sistema
   * @returns {Promise<Array>} Array de objetos GPU detectados
   */
  async detectGPUs() {
    // Retornar cache si está vigente
    if (this._detectionCache && this._cacheTimestamp) {
      const now = Date.now();
      if (now - this._cacheTimestamp < this._cacheTTL) {
        return this._detectionCache;
      }
    }

    const gpus = [];

    try {
      // Detectar GPUs NVIDIA
      const nvidiaGPUs = await this._detectNVIDIA();
      gpus.push(...nvidiaGPUs);

      // Detectar dispositivos VAAPI (Intel/AMD)
      const vaapiDevices = await this._detectVAAPI();
      gpus.push(...vaapiDevices);

      // Detectar Intel QSV
      const qsvDevices = await this._detectQSV();
      gpus.push(...qsvDevices);

      // Detectar VideoToolbox (macOS)
      const videotoolboxDevices = await this._detectVideoToolbox();
      gpus.push(...videotoolboxDevices);
    } catch (error) {
      logger.error('Error detectando GPUs:', error);
    }

    // Guardar en cache
    this._detectionCache = gpus;
    this._cacheTimestamp = Date.now();

    return gpus;
  }

  /**
   * Detecta GPUs NVIDIA usando nvidia-smi
   * @returns {Promise<Array>} Array de GPUs NVIDIA
   */
  async _detectNVIDIA() {
    const gpus = [];

    try {
      // Verificar si nvidia-smi está disponible
      execSync('nvidia-smi --version', { 
        encoding: 'utf8', 
        timeout: 3000,
        stdio: 'pipe'
      });

      // Obtener lista de GPUs
      const output = execSync('nvidia-smi --query-gpu=index,name --format=csv,noheader,nounits', {
        encoding: 'utf8',
        timeout: 5000,
        stdio: 'pipe'
      });

      const lines = output.trim().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;

        const parts = line.split(',').map(p => p.trim());
        if (parts.length >= 2) {
          const index = parseInt(parts[0]);
          const name = parts.slice(1).join(',').trim();

          // Verificar que NVENC está disponible probando con FFmpeg
          const hasNVENC = await this._testNVENC(index);

          gpus.push({
            type: 'nvenc',
            index: index,
            name: name || `NVIDIA GPU ${index}`,
            available: hasNVENC
          });
        }
      }
    } catch (error) {
      // nvidia-smi no está disponible o hay error
      logger.debug('NVIDIA GPUs no detectadas:', error.message);
    }

    return gpus;
  }

  /**
   * Prueba si NVENC está disponible para una GPU específica
   * @param {number} gpuIndex - Índice de la GPU
   * @returns {Promise<boolean>} True si NVENC está disponible
   */
  async _testNVENC(gpuIndex) {
    try {
      // Verificar que FFmpeg tiene soporte para NVENC
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      if (!encodersOutput.includes('h264_nvenc') && !encodersOutput.includes('hevc_nvenc')) {
        return false;
      }

      // Probar acceso a la GPU específica (opcional, puede ser costoso)
      // Por ahora, si nvidia-smi funciona y FFmpeg tiene NVENC, asumimos que está disponible
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Detecta dispositivos VAAPI disponibles
   * @returns {Promise<Array>} Array de dispositivos VAAPI
   */
  async _detectVAAPI() {
    const devices = [];

    try {
      // Listar dispositivos en /dev/dri/
      const driPath = '/dev/dri';
      
      if (!fs.existsSync(driPath)) {
        return devices;
      }

      const files = fs.readdirSync(driPath);
      const renderDevices = files.filter(f => f.startsWith('renderD'));

      // Verificar que FFmpeg tiene soporte para VAAPI
      let hasVAAPISupport = false;
      try {
        const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
          encoding: 'utf8',
          timeout: 5000
        });
        hasVAAPISupport = encodersOutput.includes('h264_vaapi') || encodersOutput.includes('hevc_vaapi');
      } catch (error) {
        // FFmpeg no disponible o error
      }

      for (let i = 0; i < renderDevices.length; i++) {
        const deviceName = renderDevices[i];
        const devicePath = path.join(driPath, deviceName);

        // Verificar que el dispositivo es accesible
        try {
          fs.accessSync(devicePath, fs.constants.R_OK);
          
          // Intentar obtener información del dispositivo usando vainfo si está disponible
          let deviceInfo = `VAAPI Device ${i}`;
          try {
            const vainfoOutput = execSync(`vainfo --display drm --device ${devicePath} 2>&1`, {
              encoding: 'utf8',
              timeout: 3000,
              stdio: 'pipe'
            });
            
            // Extraer nombre del dispositivo si está disponible
            const nameMatch = vainfoOutput.match(/vainfo: Device name: (.+)/);
            if (nameMatch) {
              deviceInfo = nameMatch[1];
            }
          } catch (error) {
            // vainfo no disponible o error, usar nombre genérico
          }

          devices.push({
            type: 'vaapi',
            index: i,
            name: deviceInfo,
            device: devicePath,
            available: hasVAAPISupport
          });
        } catch (error) {
          // Dispositivo no accesible, saltar
          logger.debug(`Dispositivo VAAPI ${devicePath} no accesible:`, error.message);
        }
      }
    } catch (error) {
      logger.debug('Error detectando dispositivos VAAPI:', error.message);
    }

    return devices;
  }

  /**
   * Detecta dispositivos Intel QSV disponibles
   * @returns {Promise<Array>} Array de dispositivos QSV
   */
  async _detectQSV() {
    const devices = [];

    try {
      // Verificar que FFmpeg tiene soporte para QSV
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      if (!encodersOutput.includes('h264_qsv') && !encodersOutput.includes('hevc_qsv')) {
        return devices;
      }

      // QSV generalmente usa el mismo dispositivo que VAAPI en Intel
      // Buscar dispositivos Intel en /dev/dri/
      const driPath = '/dev/dri';
      
      if (fs.existsSync(driPath)) {
        const files = fs.readdirSync(driPath);
        const renderDevices = files.filter(f => f.startsWith('renderD'));

        // Filtrar dispositivos Intel (generalmente renderD128 es el primero)
        // Por ahora, asumimos que hay al menos un dispositivo QSV si hay codecs QSV disponibles
        if (renderDevices.length > 0) {
          devices.push({
            type: 'qsv',
            index: 0,
            name: 'Intel Quick Sync Video',
            available: true
          });
        }
      } else {
        // Si no hay /dev/dri, aún puede haber QSV disponible (depende del sistema)
        devices.push({
          type: 'qsv',
          index: 0,
          name: 'Intel Quick Sync Video',
          available: true
        });
      }
    } catch (error) {
      logger.debug('Error detectando dispositivos QSV:', error.message);
    }

    return devices;
  }

  /**
   * Detecta VideoToolbox disponible (macOS)
   * @returns {Promise<Array>} Array de dispositivos VideoToolbox
   */
  async _detectVideoToolbox() {
    const devices = [];

    // Solo en macOS
    if (os.platform() !== 'darwin') {
      return devices;
    }

    try {
      // Verificar que FFmpeg tiene soporte para VideoToolbox
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      if (encodersOutput.includes('h264_videotoolbox') || encodersOutput.includes('hevc_videotoolbox')) {
        devices.push({
          type: 'videotoolbox',
          index: 0,
          name: 'VideoToolbox (macOS)',
          available: true
        });
      }
    } catch (error) {
      logger.debug('Error detectando VideoToolbox:', error.message);
    }

    return devices;
  }

  /**
   * Limpia el cache de detección
   */
  clearCache() {
    this._detectionCache = null;
    this._cacheTimestamp = null;
  }

  /**
   * Obtiene información de una GPU específica por tipo e índice
   * @param {string} type - Tipo de GPU (nvenc, vaapi, qsv, videotoolbox)
   * @param {number} index - Índice de la GPU
   * @returns {Promise<Object|null>} Información de la GPU o null si no se encuentra
   */
  async getGPU(type, index) {
    const gpus = await this.detectGPUs();
    return gpus.find(gpu => gpu.type === type && gpu.index === index) || null;
  }
}

module.exports = new GPUDetectionService();
