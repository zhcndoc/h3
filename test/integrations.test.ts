import express from "express";
import createConnectApp from "connect";
import { createElement } from "react";
import * as reactDom from "react-dom/server";
import { fromNodeHandler, defineNodeHandler } from "../src/adapters/node";
import { toNodeHandler } from "../src";
import { describeMatrix } from "./_setup";

describeMatrix("integrations", (t, { it, expect, describe }) => {
  describe("react", () => {
    it("renderToString", async () => {
      t.app.use("/", () => {
        const el = createElement("h1", null, `Hello`);
        return reactDom.renderToString(el);
      });
      const res = await t.fetch("/");
      expect(await res.text()).toBe("<h1>Hello</h1>");
    });

    // renderToPipeableStream returns a Node.js stream, which is not supported in the browser
    // renderToReadableStream seems not exported from react-dom/server (!)
    it.skipIf(t.target === "web")("renderToPipeableStream", async () => {
      t.app.use("/", () => {
        const el = createElement("h1", null, `Hello`);
        return reactDom.renderToPipeableStream(el);
      });
      const res = await t.fetch("/");
      expect(await res.text()).toBe("<h1>Hello</h1>");
    });
  });

  describe.skipIf(t.target === "web")("express", () => {
    it("can wrap an express instance", async () => {
      const expressApp = express();
      expressApp.use("/", (_req, res) => {
        res.json({ express: "works" });
      });
      t.app.use("/api/express", fromNodeHandler(expressApp));
      const res = await t.fetch("/api/express");

      expect(await res.json()).toEqual({ express: "works" });
    });

    it("can be used as express middleware", async () => {
      const expressApp = express();
      t.app.use(
        "/api/*",
        fromNodeHandler((_req, res, next) => {
          (res as any).prop = "42";
          next();
        }),
      );
      t.app.use(
        "/api/hello",
        fromNodeHandler(
          defineNodeHandler((req, res) => ({
            url: req.url,
            prop: (res as any).prop,
          })),
        ),
      );
      expressApp.use("/api", toNodeHandler(t.app) as any);

      const res = await t.fetch("/api/hello");

      expect(await res.json()).toEqual({ url: "/api/hello", prop: "42" });
    });

    it("can wrap a connect instance", async () => {
      const connectApp = createConnectApp();
      connectApp.use("/api/connect", (_req, res) => {
        res.setHeader("content-type", "application/json");
        res.end(JSON.stringify({ connect: "works" }));
      });
      t.app.use("/**", fromNodeHandler(connectApp));
      const res = await t.fetch("/api/connect");

      expect(await res.json()).toEqual({ connect: "works" });
    });

    it("can be used as connect middleware", async () => {
      const connectApp = createConnectApp();
      t.app.use(
        "/api/hello",
        fromNodeHandler((_req, res, next) => {
          (res as any).prop = "42";
          next?.();
        }),
      );
      t.app.use(
        "/api/hello",
        fromNodeHandler((req, res) => ({
          url: req.url,
          prop: (res as any).prop,
        })),
      );
      connectApp.use("/api", toNodeHandler(t.app));

      const res = await t.fetch("/api/hello");

      expect(await res.json()).toEqual({ url: "/api/hello", prop: "42" });
    });
  });
});
