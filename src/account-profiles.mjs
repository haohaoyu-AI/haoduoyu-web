import { fail } from './lib/errors.mjs';

const invalid = message => fail(400, 'VALIDATION_ERROR', message);
const unsupported = () => invalid('请粘贴今日头条、知乎或微信公众号的公开主页链接，文章和后台链接不能作为账号主页');

// Parse known public profile routes locally. Never request the supplied URL or
// treat a homepage link as authorization to read private platform statistics.
export function normalizeAccountProfile(value, expectedPlatform) {
  if (typeof value !== 'string' || !value.trim() || value.length > 2048 ||
    /[\u0000-\u001f\u007f\\]/.test(value) || /\s/.test(value.trim())) {
    invalid('账号主页须为完整 HTTP(S) 链接，且不能包含空格或控制字符');
  }
  let url;
  try { url = new URL(value.trim()); } catch { invalid('账号主页须为完整 HTTP(S) 链接'); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port) {
    invalid('账号主页须为不含登录凭据和自定义端口的 HTTP(S) 链接');
  }
  const host = url.hostname.toLowerCase();
  let platform, profile_url, platform_identity;
  if (['zhihu.com', 'www.zhihu.com'].includes(host)) {
    const match = /^\/(people|org)\/([A-Za-z0-9_-]{1,128})(?:\/(?:activities|answers|posts|followers|following|collections))?\/?$/.exec(url.pathname);
    if (!match) unsupported();
    platform = 'zhihu';
    profile_url = `https://www.zhihu.com/${match[1]}/${match[2]}`;
    platform_identity = `zhihu:${match[1]}:${match[2]}`;
  } else if (['toutiao.com', 'www.toutiao.com', 'm.toutiao.com'].includes(host)) {
    const token = /^\/c\/user\/token\/([A-Za-z0-9_-]{8,512})\/?$/.exec(url.pathname);
    const numeric = /^\/(?:user(?:\/profile)?|c\/user)\/(\d{1,30})\/?$/.exec(url.pathname);
    if (!token && !numeric) unsupported();
    platform = 'toutiao';
    profile_url = token ? `https://www.toutiao.com/c/user/token/${token[1]}/` : `https://www.toutiao.com/user/${numeric[1]}/`;
    platform_identity = token ? `toutiao:token:${token[1]}` : `toutiao:user:${numeric[1]}`;
  } else if (host === 'mp.weixin.qq.com') {
    const actions = url.searchParams.getAll('action'), identities = url.searchParams.getAll('__biz');
    if (!/^\/mp\/profile_ext\/?$/.test(url.pathname) || actions.length !== 1 || actions[0] !== 'home' ||
      identities.length !== 1 || !/^[A-Za-z0-9+/]{4,160}={0,2}$/.test(identities[0])) unsupported();
    platform = 'wechat';
    const identity = identities[0];
    const query = new URLSearchParams({action: 'home', __biz: identity});
    profile_url = `https://mp.weixin.qq.com/mp/profile_ext?${query}`;
    platform_identity = `wechat:biz:${identity}`;
  } else unsupported();
  if (expectedPlatform && expectedPlatform !== platform) invalid('主页链接与所选平台不一致，请修改平台或主页链接');
  return {platform, profile_url, platform_identity};
}

export const hasAccountProfileInput = body => Object.hasOwn(body, 'profile_url');
export const hasAccountProfileValue = body => hasAccountProfileInput(body) && body.profile_url !== '' && body.profile_url !== null;
