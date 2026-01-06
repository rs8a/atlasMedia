const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const logger = require('./logger');

/**
 * Verifica si un proceso está corriendo por su PID
 */
async function isProcessRunning(pid) {
  if (!pid) return false;
  
  try {
    // En Linux, verificar si el proceso existe
    await execAsync(`kill -0 ${pid} 2>/dev/null`);
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Mata un proceso por su PID
 */
async function killProcess(pid, signal = 'SIGTERM') {
  if (!pid) return false;
  
  try {
    process.kill(pid, signal);
    // Esperar un poco para verificar que se mató
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Si aún existe, forzar con SIGKILL
    if (await isProcessRunning(pid)) {
      logger.warn(`Proceso ${pid} no respondió a ${signal}, forzando con SIGKILL`);
      process.kill(pid, 'SIGKILL');
      await new Promise(resolve => setTimeout(resolve, 200));
    }
    
    return !(await isProcessRunning(pid));
  } catch (error) {
    if (error.code === 'ESRCH') {
      // Proceso no existe
      return true;
    }
    logger.error(`Error matando proceso ${pid}:`, error);
    return false;
  }
}

/**
 * Obtiene información de red de un proceso
 */
async function getNetworkInfo(pid) {
  if (!pid) {
    return {
      rxBytes: 0,
      txBytes: 0,
      totalBytes: 0,
      activeConnections: 0,
      rxBytesFormatted: '0 B',
      txBytesFormatted: '0 B',
      totalBytesFormatted: '0 B'
    };
  }
  
  try {
    let rxBytes = 0;
    let txBytes = 0;
    let activeConnections = 0;
    
    // Método 1: Intentar leer desde /proc/[pid]/net/dev (si el proceso tiene su propio namespace)
    try {
      const { stdout: netDev } = await execAsync(`cat /proc/${pid}/net/dev 2>/dev/null || echo ""`);
      
      if (netDev && netDev.trim()) {
        const lines = netDev.split('\n');
        for (const line of lines) {
          // Formato: interface: rx_bytes rx_packets ... tx_bytes tx_packets
          if (line.includes(':') && !line.includes('lo:') && !line.includes('Inter-')) {
            const parts = line.trim().split(/\s+/);
            if (parts.length >= 10) {
              rxBytes += parseInt(parts[1]) || 0; // bytes recibidos
              txBytes += parseInt(parts[9]) || 0; // bytes enviados
            }
          }
        }
      }
    } catch (error) {
      // Si no funciona, continuamos con otros métodos
      logger.debug(`No se pudo leer /proc/${pid}/net/dev`);
    }
    
    // Obtener conexiones activas del proceso usando ss o netstat
    // Intentar con ss primero (más moderno y preciso)
    try {
      // ss muestra conexiones TCP/UDP con formato: ESTAB 0 0 192.168.1.12:3000 192.168.1.100:54321 users:(("ffmpeg",pid=123,fd=5))
      const { stdout: ssOutput } = await execAsync(`ss -tnp 2>/dev/null | grep "pid=${pid}" || echo ""`);
      if (ssOutput && ssOutput.trim()) {
        const lines = ssOutput.trim().split('\n');
        // Filtrar líneas que no sean headers y que tengan el PID
        const connections = lines.filter(line => {
          const trimmed = line.trim();
          return trimmed && 
                 !trimmed.includes('State') && 
                 !trimmed.includes('Netid') &&
                 trimmed.includes(`pid=${pid}`);
        });
        activeConnections = connections.length;
      }
    } catch (error) {
      logger.debug(`No se pudo usar ss para obtener conexiones del PID ${pid}:`, error.message);
    }
    
    // Si ss no funcionó o no encontró conexiones, intentar con netstat
    if (activeConnections === 0) {
      try {
        // netstat muestra conexiones con formato: tcp 0 0 192.168.1.12:3000 192.168.1.100:54321 ESTABLISHED 123/ffmpeg
        const { stdout: netstat } = await execAsync(`netstat -tnp 2>/dev/null | grep "${pid}/" || echo ""`);
        if (netstat && netstat.trim()) {
          const lines = netstat.trim().split('\n');
          const connections = lines.filter(line => {
            const trimmed = line.trim();
            return trimmed && 
                   !trimmed.includes('Active') && 
                   !trimmed.includes('Proto') &&
                   trimmed.includes(`${pid}/`);
          });
          activeConnections = connections.length;
        }
      } catch (netstatError) {
        logger.debug(`No se pudo usar netstat para obtener conexiones del PID ${pid}:`, netstatError.message);
      }
    }
    
    // Como último recurso, intentar con lsof (puede requerir permisos)
    if (activeConnections === 0) {
      try {
        // lsof muestra sockets de red abiertos por el proceso
        const { stdout: lsof } = await execAsync(`lsof -p ${pid} -a -i 2>/dev/null | grep -v "^COMMAND" | wc -l || echo "0"`);
        const count = parseInt(lsof.trim()) || 0;
        if (count > 0) {
          activeConnections = count;
        }
      } catch (error) {
        // lsof puede no estar disponible o requerir permisos
        logger.debug(`No se pudo usar lsof para obtener conexiones del PID ${pid}:`, error.message);
      }
    }
    
    return {
      rxBytes,           // Bytes recibidos (total)
      txBytes,           // Bytes enviados (total)
      totalBytes: rxBytes + txBytes,
      activeConnections,
      rxBytesFormatted: formatBytes(rxBytes),
      txBytesFormatted: formatBytes(txBytes),
      totalBytesFormatted: formatBytes(rxBytes + txBytes)
    };
  } catch (error) {
    logger.debug(`Error obteniendo información de red para PID ${pid}:`, error.message);
    return {
      rxBytes: 0,
      txBytes: 0,
      totalBytes: 0,
      activeConnections: 0,
      rxBytesFormatted: '0 B',
      txBytesFormatted: '0 B',
      totalBytesFormatted: '0 B'
    };
  }
}

/**
 * Formatea bytes a formato legible (KB, MB, GB)
 */
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
}

/**
 * Obtiene información de un proceso
 */
async function getProcessInfo(pid) {
  if (!pid) return null;
  
  try {
    const { stdout } = await execAsync(`ps -p ${pid} -o pid,etime,pcpu,pmem,cmd --no-headers`);
    const parts = stdout.trim().split(/\s+/);
    
    // Obtener información de red
    const networkInfo = await getNetworkInfo(pid);
    
    const processInfo = {
      pid: parseInt(parts[0]),
      elapsedTime: parts[1],
      cpuPercent: parseFloat(parts[2]) || 0,
      memoryPercent: parseFloat(parts[3]) || 0,
      command: parts.slice(4).join(' ')
    };
    
    // Agregar información de red (siempre, incluso si es 0)
    processInfo.network = networkInfo || {
      rxBytes: 0,
      txBytes: 0,
      totalBytes: 0,
      activeConnections: 0,
      rxBytesFormatted: '0 B',
      txBytesFormatted: '0 B',
      totalBytesFormatted: '0 B'
    };
    
    return processInfo;
  } catch (error) {
    return null;
  }
}

module.exports = {
  isProcessRunning,
  killProcess,
  getProcessInfo
};

