import { createRemoteJWKSet, jwtVerify } from "jose";
const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
export async function accessIdentity(token: string | null, issuer: string | undefined, audience: string | undefined) {
  if (!token || !issuer || !audience || !/^https:\/\/[a-z0-9-]+\.cloudflareaccess\.com$/.test(issuer)) return null;
  try {
    let keys=keySets.get(issuer);
    if(!keys){keys=createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));keySets.set(issuer,keys);}
    return verifyAccessIdentity(token,keys,issuer,audience);
  } catch { return null; }
}
export async function verifyAccessIdentity(token: string, keys: Parameters<typeof jwtVerify>[1], issuer: string, audience: string) {
  try {
    const {payload}=await jwtVerify(token,keys,{issuer,audience,algorithms:["RS256"],requiredClaims:["sub","exp","iat","email"]});
    if(typeof payload.sub!=="string"||typeof payload.email!=="string")return null;
    return {userId:`access:${payload.sub}`,email:payload.email,displayName:payload.email,fullName:null};
  } catch { return null; }
}
