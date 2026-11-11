// src/main/user-agent.js
// Configures User-Agent and Client Hints to ensure Microsoft Teams
// fully enables HD calling, camera, and screen sharing on Linux.

const CHROME_VERSION = '131.0.0.0';
const CHROME_MAJOR = '131';

const LINUX_CHROME_UA = `Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${CHROME_VERSION} Safari/537.36`;

function setupUserAgent(session) {
  // 1. Set default session user-agent
  session.setUserAgent(LINUX_CHROME_UA);

  // 2. Intercept and sanitize headers for all Teams requests
  const filter = {
    urls: [
      '*://*.teams.microsoft.com/*',
      '*://*.teams.live.com/*',
      '*://*.microsoft.com/*',
      '*://*.microsoftonline.com/*',
      '*://*.live.com/*',
      '*://*.office.com/*'
    ]
  };

  session.webRequest.onBeforeSendHeaders(filter, (details, callback) => {
    const requestHeaders = Object.assign({}, details.requestHeaders);

    // Overwrite User-Agent
    requestHeaders['User-Agent'] = LINUX_CHROME_UA;

    // Provide standard Chrome Client Hints
    requestHeaders['Sec-CH-UA'] = `"Chromium";v="${CHROME_MAJOR}", "Google Chrome";v="${CHROME_MAJOR}", "Not_A Brand";v="24"`;
    requestHeaders['Sec-CH-UA-Mobile'] = '?0';
    requestHeaders['Sec-CH-UA-Platform'] = '"Linux"';

    callback({ requestHeaders });
  });
}

module.exports = {
  LINUX_CHROME_UA,
  setupUserAgent
};
