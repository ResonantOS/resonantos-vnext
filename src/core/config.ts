export const getPi5Config = () => {
  const ip = import.meta.env.VITE_PI5_TAILNET_IP ?? "127.0.0.1";
  const httpPort = import.meta.env.VITE_PI5_HTTP_PORT ?? "1431";
  const apiPort = import.meta.env.VITE_API_PORT ?? "1430";
  return {
    pi5TailnetIp: ip,
    httpPort: parseInt(httpPort, 10),
    apiPort: parseInt(apiPort, 10),
    apiBase: `http://${ip}:${apiPort}`,
    httpApiBase: `http://${ip}:${httpPort}`,
  };
};