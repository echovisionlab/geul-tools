// The WWW API ingress passes its host-only Kratos cookie to this server.
// Validate it through the existing authenticated Member RPC on every request.
export function createAuthenticator({
  oathkeeperUrl,
  cookieName,
  fetcher = fetch,
}) {
  const endpoint = new URL(
    "/api/rpc/api.manage.v1.MemberService/GetCurrentSession",
    oathkeeperUrl,
  );
  return async function authenticateRequest(request) {
    const cookies = (request.headers.get("cookie") ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter((part) => part.startsWith(`${cookieName}=`));
    if (cookies.length !== 1 || cookies[0] === `${cookieName}=`) return null;
    const response = await fetcher(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Connect-Protocol-Version": "1",
        Cookie: cookies[0],
      },
      body: "{}",
      redirect: "error",
      signal: AbortSignal.timeout(10000),
    });
    if (response.status === 401 || response.status === 403) return null;
    if (!response.ok)
      throw new Error(`Session validation failed (${response.status})`);
    const session = await response.json();
    const member = session.member;
    if (
      session.onboarded !== true ||
      member?.status !== "ACCOUNT_STATUS_ACTIVE" ||
      typeof member.summary?.id !== "string" ||
      !member.summary.id
    )
      return null;
    return member.summary.id;
  };
}

let configuredAuthenticator;
export async function authenticate(request) {
  if (!configuredAuthenticator) {
    if (!process.env.OATHKEEPER_URL || !process.env.SESSION_COOKIE_NAME)
      throw new Error(
        "YouTube authentication requires OATHKEEPER_URL and SESSION_COOKIE_NAME",
      );
    configuredAuthenticator = createAuthenticator({
      oathkeeperUrl: process.env.OATHKEEPER_URL,
      cookieName: process.env.SESSION_COOKIE_NAME,
    });
  }
  return configuredAuthenticator(request);
}
