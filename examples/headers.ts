import { createH3 } from "h3";

export const app = createH3();

app.get("/user-agent", (event) => {
  const userAgent = event.req.headers.get("user-agent");

  event.res.headers.set("content-type", "text/plain");
  event.res.headers.set("x-server", "nitro");

  return {
    userAgent: userAgent,
    responseHeaders: Object.fromEntries(event.res.headers.entries()),
  };
});
