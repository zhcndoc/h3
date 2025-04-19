import { H3, serve, defineEventHandler } from "h3";

export const app = new H3();

app.get(
  "/",
  defineEventHandler({
    onRequest: () => {
      // Do anything you want here like authentication, rate limiting, etc.
      console.log("onRequest");
      // Never return anything from onRequest to avoid to close the connection
    },
    onBeforeResponse: () => {
      // Do anything you want here like logging, collecting metrics, or output compression, etc.
      console.log("onResponse");
      // Never return anything from onResponse to avoid to close the connection
    },
    handler: () => "GET: hello world",
  }),
);

await serve(app)
  .ready()
  .then((s) => console.log(`Server running at ${s.url}`));
