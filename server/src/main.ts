import dotenv from "dotenv";
import fastify from "fastify";
import Redis from "ioredis";
import fastifyCors from "@fastify/cors";
import fastifyIO from "fastify-socket.io";
import closeWithGrace from "close-with-grace";
import { randomUUID } from "crypto";

dotenv.config();

const PORT = parseInt(process.env.PORT || "3001", 10);
const HOST = process.env.HOST || "0.0.0.0";
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const UPSTASH_REDIS_REST_URL = process.env.UPSTASH_REDIS_REST_URL;
// const LOCAL_REDIS_URL = process.env.LOCAL_REDIS_URL;

const CONNECTION_COUNT_KEY = "chat:connection-count";
const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated";
const NEW_MESSAGE_CHANNEL = "chat:new-message";
const MESSAGES_KEY = "chat-messages";

// function sendMessageToRoom({ room, messageContents }) {
//     const channel = `chat:${room}:messages`;
// };

if(!UPSTASH_REDIS_REST_URL) {
    console.error("missing UPSTASH_REDIS_REST_URL");
    process.exit(1);
}

// if(!LOCAL_REDIS_URL) {
//     console.error("missing UPSTASH_REDIS_REST_URL");
//     process.exit(1);
// }

const publisher = new Redis(UPSTASH_REDIS_REST_URL); // { tls: { rejectUnauthorized: true, }}
const subscriber = new Redis(UPSTASH_REDIS_REST_URL);

let connectedClients = 0;

async function buildServer() {
    const app = fastify();

    await app.register(fastifyCors, {
        origin: CORS_ORIGIN,
    });

    await app.register(fastifyIO);

    const currentCount = await publisher.get(CONNECTION_COUNT_KEY);

    if(!currentCount) {
        await publisher.set(CONNECTION_COUNT_KEY, 0);
    }

    // The `io` decorator is NOT typed. hence type errors below.
    //@ts-ignore
    app.io.on("connection", async (io) => {
        console.log("client connected");

        // increment channel count once a client connects
        const incrCount = await publisher.incr(CONNECTION_COUNT_KEY);

        connectedClients++;

        // publish new channel count so subscribers can update
        await publisher.publish(CONNECTION_COUNT_UPDATED_CHANNEL, String(incrCount));

        // publish channel for sending messages
        io.on(NEW_MESSAGE_CHANNEL, async (payload: any) => {
            const message = payload.message;
            if(!message) {
                return;
            }
            console.log("Ring ring: ", message);
            await publisher.publish(NEW_MESSAGE_CHANNEL, message.toString());
        })

        io.on("disconnect", async () => {
            console.log("client disconnected");
            connectedClients--;
            const decrCount = await publisher.decr(CONNECTION_COUNT_KEY);
            // publish new channel count so subscribers can update
            await publisher.publish(CONNECTION_COUNT_UPDATED_CHANNEL, String(decrCount));
        })
    })

    // subscribe this instance to the channel
    subscriber.subscribe(CONNECTION_COUNT_UPDATED_CHANNEL, (err, count) => {
        if(err) {
            console.error(`Error subscribing to channel ${CONNECTION_COUNT_UPDATED_CHANNEL}`, err);
            return;
        }

        console.log(`${count} clients subscribing to ${CONNECTION_COUNT_UPDATED_CHANNEL} channel`);
    })

    // subscribe to message channel and listen for messages
    subscriber.subscribe(NEW_MESSAGE_CHANNEL, (err, count) => {
        if (err) {
            console.error(`Error subscribing to ${NEW_MESSAGE_CHANNEL}`);
            return;
        }
        console.log(`${count} clients subscribing to ${NEW_MESSAGE_CHANNEL} channel`);
    })

    subscriber.on("message", (channel, text) => {
        if(channel === CONNECTION_COUNT_UPDATED_CHANNEL) {
            //@ts-ignore
            app.io.emit(CONNECTION_COUNT_UPDATED_CHANNEL, {
                count: text,
            })

            return;
        }

        if(channel === NEW_MESSAGE_CHANNEL) {
            //@ts-ignore
            app.io.emit(NEW_MESSAGE_CHANNEL, {
                message: text,
                id: randomUUID(),
                createdAt: new Date(),
                port: PORT,
            })

            return;
        }
    });

    app.get("/healthcheck", () => {
        return {
            status: "ok",
            port: PORT,
        }
    });

    return app;
}

async function main() {
    const app = await buildServer();

    try {
        await app.listen({
            port: PORT,
            host: HOST,
        })

        closeWithGrace({ delay: 2000 }, async ({ signal, err }) => {
            console.log("shutting down");
            console.log({ signal, err });
            console.log(connectedClients);

            if (connectedClients > 0) {
                console.log(`Removing ${connectedClients} from count`);
                const currentCount = parseInt((await publisher.get(CONNECTION_COUNT_KEY)) || '0', 10);
                const newCount = Math.max(currentCount - connectedClients, 0)
                await publisher.set(CONNECTION_COUNT_KEY, newCount);
            }

            await app.close();
            console.log("shutdown complete, goodbye.");
        })

        console.log(`Server started at http://${HOST}:${PORT}`);
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

main();