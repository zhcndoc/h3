import { H3, handleCors } from "h3";

export const app = new H3();

app.get("/hello", (event) => {
  if (handleCors(event, { origin: "*" })) {
    return;
  }
  return "Hello World!";
});
