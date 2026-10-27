const os = require('os');

// Adaptadores que casi nunca son la Wi-Fi real (máquinas virtuales, WSL, Docker...).
const VIRTUAL_ADAPTER = /virtualbox|vmware|vethernet|wsl|hyper-v|docker|loopback|tailscale|zerotier/i;

/**
 * Devuelve las IPv4 locales del ordenador, con las más probables (Wi-Fi/Ethernet) primero.
 * @returns {{ address: string, name: string, likely: boolean }[]}
 */
function getLanAddresses() {
  const result = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    for (const entry of entries || []) {
      const isIPv4 = entry.family === 'IPv4' || entry.family === 4;
      if (!isIPv4 || entry.internal) continue;
      const likely = !VIRTUAL_ADAPTER.test(name) && !entry.address.startsWith('169.254.') && !entry.address.startsWith('192.168.56.');
      result.push({ address: entry.address, name, likely });
    }
  }
  return result.sort((a, b) => Number(b.likely) - Number(a.likely));
}

module.exports = { getLanAddresses };
