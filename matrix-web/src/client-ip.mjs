import { BlockList, isIP, SocketAddress } from 'node:net';
import { fail } from './auth.mjs';

function address(value) {
  const family = isIP(value);
  if (!family || value.includes('%')) return null;
  if (family === 4) return value;
  const canonical = new SocketAddress({ address: value, family: 'ipv6' }).address;
  // Use one bucket for IPv4 and its mapped IPv6 socket representation.
  return canonical.startsWith('::ffff:') ? canonical.slice(7) : canonical;
}

export function clientIpResolver(configuration = '') {
  if (typeof configuration !== 'string') throw new Error('TRUSTED_PROXIES must contain IP addresses or CIDRs');
  const trusted = new BlockList();
  if (configuration.trim()) {
    for (const entry of configuration.split(',')) {
      const [ip, prefix, ...extra] = entry.trim().split('/');
      const version = isIP(ip), family = version === 4 ? 'ipv4' : 'ipv6';
      if (!version || ip.includes('%') || extra.length ||
          prefix !== undefined && (!/^\d+$/.test(prefix) || Number(prefix) < 1 || Number(prefix) > (version === 4 ? 32 : 128)))
        throw new Error('TRUSTED_PROXIES requires explicit IP addresses or CIDRs; wildcard trust is forbidden');
      if (prefix === undefined) trusted.addAddress(ip, family);
      else trusted.addSubnet(ip, Number(prefix), family);
    }
  }
  const isTrusted = ip => trusted.check(ip, isIP(ip) === 4 ? 'ipv4' : 'ipv6');
  return req => {
    const peer = address(req.socket.remoteAddress || '') || 'unknown';
    const forwarded = req.headers['x-forwarded-for'];
    // A client cannot opt itself into proxy trust by setting a header.
    if (peer === 'unknown' || !isTrusted(peer) || forwarded === undefined) return peer;
    const chain = typeof forwarded === 'string' ? forwarded.split(',').map(ip => address(ip.trim())) : [];
    if (!chain.length || chain.length > 32 || chain.some(ip => !ip))
      throw fail(400, 'INVALID_FORWARDED_FOR', '反向代理客户端地址格式无效');
    // Walk outwards from the socket. Never trust attacker-supplied entries
    // to the left of the first untrusted hop.
    let client = peer;
    for (let index = chain.length - 1; index >= 0 && isTrusted(client); index--) client = chain[index];
    return client;
  };
}
