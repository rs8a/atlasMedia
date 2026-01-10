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
    // Cache para codecs disponibles
    this._codecsCache = null;
  }

  /**
   * Detecta codecs disponibles usando ffmpeg -encoders
   * @returns {Promise<Object>} Objeto con codecs agrupados por tipo
   */
  async _detectAvailableCodecs() {
    // Retornar cache si existe
    if (this._codecsCache) {
      return this._codecsCache;
    }

    const codecs = {
      nvenc: [],
      vaapi: [],
      qsv: [],
      videotoolbox: [],
      amf: []
    };

    try {
      // Ejecutar ffmpeg -encoders para obtener todos los codecs disponibles
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      // Patrones para detectar codecs por tipo
      // Formato de ffmpeg -encoders: "V..... h264_nvenc           NVIDIA NVENC H.264 encoder"
      // V = Video encoder, seguido de flags (puntos/letras), luego espacios y nombre del codec
      // Usamos un patrón más flexible que busca "V" seguido de cualquier cosa hasta encontrar el codec
      const patterns = {
        nvenc: /V[.\w]+\s+(\w+_nvenc)\s/g,
        vaapi: /V[.\w]+\s+(\w+_vaapi)\s/g,
        qsv: /V[.\w]+\s+(\w+_qsv)\s/g,
        videotoolbox: /V[.\w]+\s+(\w+_videotoolbox)\s/g,
        amf: /V[.\w]+\s+(\w+_amf)\s/g
      };

      // Buscar codecs para cada tipo
      for (const [type, pattern] of Object.entries(patterns)) {
        let match;
        while ((match = pattern.exec(encodersOutput)) !== null) {
          const codecName = match[1];
          if (!codecs[type].includes(codecName)) {
            codecs[type].push(codecName);
          }
        }
      }

      // Ordenar codecs por nombre
      for (const type of Object.keys(codecs)) {
        codecs[type].sort();
      }

      // Guardar en cache
      this._codecsCache = codecs;
    } catch (error) {
      logger.warn('Error detectando codecs disponibles:', error.message);
    }

    return codecs;
  }

  /**
   * Obtiene codecs compatibles para un tipo de GPU específico
   * @param {string} gpuType - Tipo de GPU (nvenc, vaapi, qsv, videotoolbox, amf)
   * @returns {Promise<Array>} Array de nombres de codecs compatibles
   */
  async _getCodecsForType(gpuType) {
    const allCodecs = await this._detectAvailableCodecs();
    return allCodecs[gpuType] || [];
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

      // Detectar GPUs AMD (AMF)
      const amfDevices = await this._detectAMF();
      gpus.push(...amfDevices);
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
          
          // Obtener codecs compatibles
          const codecs = await this._getCodecsForType('nvenc');

          gpus.push({
            type: 'nvenc',
            index: index,
            name: name || `NVIDIA GPU ${index}`,
            available: hasNVENC,
            codecs: codecs
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

          // Obtener codecs compatibles
          const codecs = await this._getCodecsForType('vaapi');

          devices.push({
            type: 'vaapi',
            index: i,
            name: deviceInfo,
            device: devicePath,
            available: hasVAAPISupport,
            codecs: codecs
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
          // Obtener codecs compatibles
          const codecs = await this._getCodecsForType('qsv');
          
          devices.push({
            type: 'qsv',
            index: 0,
            name: 'Intel Quick Sync Video',
            available: true,
            codecs: codecs
          });
        }
      } else {
        // Si no hay /dev/dri, aún puede haber QSV disponible (depende del sistema)
        // Obtener codecs compatibles
        const codecs = await this._getCodecsForType('qsv');
        
        devices.push({
          type: 'qsv',
          index: 0,
          name: 'Intel Quick Sync Video',
          available: true,
          codecs: codecs
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
        // Obtener codecs compatibles
        const codecs = await this._getCodecsForType('videotoolbox');
        
        devices.push({
          type: 'videotoolbox',
          index: 0,
          name: 'VideoToolbox (macOS)',
          available: true,
          codecs: codecs
        });
      }
    } catch (error) {
      logger.debug('Error detectando VideoToolbox:', error.message);
    }

    return devices;
  }

  /**
   * Detecta GPUs AMD con soporte AMF
   * @returns {Promise<Array>} Array de dispositivos AMF
   */
  async _detectAMF() {
    const devices = [];

    try {
      // Verificar que FFmpeg tiene soporte para AMF
      const encodersOutput = execSync(`${constants.FFMPEG_PATH} -hide_banner -encoders 2>&1`, {
        encoding: 'utf8',
        timeout: 5000
      });

      // Verificar si hay codecs AMF disponibles
      const amfCodecs = await this._getCodecsForType('amf');
      
      if (amfCodecs.length > 0) {
        // AMF generalmente se usa con una sola GPU o se detecta automáticamente
        // Por ahora, agregamos un dispositivo genérico
        devices.push({
          type: 'amf',
          index: 0,
          name: 'AMD Video Coding Engine (AMF)',
          available: true,
          codecs: amfCodecs
        });
      }
    } catch (error) {
      logger.debug('Error detectando dispositivos AMF:', error.message);
    }

    return devices;
  }

  /**
   * Limpia el cache de detección
   */
  clearCache() {
    this._detectionCache = null;
    this._cacheTimestamp = null;
    this._codecsCache = null;
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
