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
  if (!pid) return null;
  
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
    
    // Método 2: Si no obtuvimos datos, intentar usar lsof para obtener información de sockets
    if (rxBytes === 0 && txBytes === 0) {
      try {
        // Obtener información de sockets abiertos por el proceso
        const { stdout: lsof } = await execAsync(`lsof -p ${pid} -a -i 2>/dev/null | wc -l || echo "0"`);
        activeConnections = parseInt(lsof.trim()) || 0;
      } catch (error) {
        // lsof puede no estar disponible
      }
    }
    
    // Obtener conexiones activas del proceso usando ss o netstat
    try {
      // Intentar con ss primero (más moderno)
      const { stdout: ssOutput } = await execAsync(`ss -tnp 2>/dev/null | grep "pid=${pid}" || echo ""`);
      if (ssOutput && ssOutput.trim()) {
        const connections = ssOutput.trim().split('\n').filter(l => l && !l.includes('State') && !l.includes('Netid'));
        activeConnections = connections.length;
      } else {
        // Fallback a netstat
        try {
          const { stdout: netstat } = await execAsync(`netstat -tnp 2>/dev/null | grep "${pid}/" || echo ""`);
          if (netstat && netstat.trim()) {
            const connections = netstat.trim().split('\n').filter(l => l && !l.includes('Active') && !l.includes('Proto'));
            activeConnections = connections.length;
          }
        } catch (netstatError) {
          // netstat puede no estar disponible
        }
      }
    } catch (error) {
      logger.debug(`No se pudo obtener conexiones para PID ${pid}`);
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
    
    // Agregar información de red si está disponible
    if (networkInfo) {
      processInfo.network = networkInfo;
    }
    
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

