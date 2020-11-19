import express from "express";
import http from "http";
import https from "https";
import { Server as SocketServer } from "socket.io"

import defaultConfig, { IConfig } from "./config";
import { createInstance } from "./instance";

type Optional<T> = {
  [P in keyof T]?: (T[P] | undefined);
};

type HTTPServer = http.Server | https.Server

function RoomServer(server: HTTPServer) {
  const app = express()
  const io = new SocketServer(server, {
      cors: {
            origin: ["http://localhost:3000", "https://web-player.vercel.app", "https://web-player-git-modularize-usepeerstate.litlmoz.vercel.app"],
            methods: ["GET", "POST"],
            allowedHeaders: ["origin", "x-requested-with", "content-type"]
        }
    })

  io.on("connection", socket => {
    socket.on("join-room", (roomId: string, userId: string) => {
      console.log(`join-room: ${roomId} ${userId}`)
      if(!roomId || !userId) {
        return
      }
      socket.join(roomId)
      socket.to(roomId).broadcast.emit("user-connected", userId)

      socket.on("disconnect", () => {
        socket.to(roomId).broadcast.emit("user-disconnected", userId)
      })
    })
  })
  return app
}

function ExpressPeerServer(server: HTTPServer, options?: IConfig) {
  const app = express();

  const newOptions: IConfig = {
    ...defaultConfig,
    ...options
  };

  if (newOptions.proxied) {
    app.set("trust proxy", newOptions.proxied === "false" ? false : !!newOptions.proxied);
  }

  app.on("mount", () => {
    if (!server) {
      throw new Error("Server is not passed to constructor - " +
        "can't start PeerServer");
    }

    createInstance({ app, server, options: newOptions });
  });

  const roomServer = RoomServer(server)
  app.use(roomServer)

  return app;
}

function PeerServer(options: Optional<IConfig> = {}, callback?: (server: HTTPServer) => void) {
  const app = express();

  let newOptions: IConfig = {
    ...defaultConfig,
    ...options
  };

  const port = newOptions.port;
  const host = newOptions.host;

  let server: HTTPServer;

  const { ssl, ...restOptions } = newOptions;

  if (ssl && ssl.key && ssl.cert) {
    server = https.createServer(ssl, app);

    newOptions = restOptions;
  } else {
    server = http.createServer(app);
  }

  app.use(function(_, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    next();
  });

  const peerjs = ExpressPeerServer(server, newOptions);
  app.use(peerjs);

  server.listen(port, host, () => callback?.(server));

  return peerjs;
}

export {
  ExpressPeerServer,
  PeerServer
};
