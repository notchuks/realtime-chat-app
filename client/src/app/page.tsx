"use client"

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import Image from "next/image";
import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";

const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || "ws://127.0.0.1";

// Timestamp format options
const options = { year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "numeric", hour12: true} as const;

const CONNECTION_COUNT_UPDATED_CHANNEL = "chat:connection-count-updated";
const NEW_MESSAGE_CHANNEL = "chat:new-message";

type Message = {
  message: string;
  id: string;
  createdAt: string;
  port: string;
}

function useSocket() {
  const [socket, setSocket] = useState<Socket | null>(null);

  useEffect(() => {
    const socketIo = io(SOCKET_URL, {
      reconnection: true,
      upgrade: true,
      transports: ["websocket", "polling"],
    })

    setSocket(socketIo);

    return function() {
      socketIo.disconnect();
      console.log("disconnected from socket")
    }
  }, []);

  return socket;
}

export default function Home() {
  const messageListRef = useRef<HTMLLIElement | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [messages, setMessages] = useState<Array<Message>>([]);
  const [ connectionCount, setConnectionCount ] = useState(0);
  const socket = useSocket();

  function scrollToBottom() {
    if (messageListRef.current) {
      console.log("Scrolling to bottom");
      messageListRef.current?.lastElementChild?.scrollIntoView();
    }
  }

  useEffect(() => {
    socket?.on("connect", () => {
      console.log("Connected to Socket");
    });

    socket?.on(NEW_MESSAGE_CHANNEL, (message: Message) => {
      setMessages((prevMessages) => {
        return [...prevMessages, message]
      });

      setTimeout(() => {
        scrollToBottom();
      }, 500)
    });

    socket?.on(CONNECTION_COUNT_UPDATED_CHANNEL, ({ count }: { count: number }) => {
      setConnectionCount(count);
    })

    // return function() {
    //   socket?.off(NEW_MESSAGE_CHANNEL);
    // }
  }, [socket])

  function handleSubmit(e: FormEvent) {
    e.preventDefault();

    socket?.emit(NEW_MESSAGE_CHANNEL, {
      message: newMessage,
    })

    setNewMessage("");
  }

  return (
    <main className="flex flex-col p-4 w-full max-w-3xl m-auto">
      <h1 className="text-4xl font-bold text-center mb-4">Websockets Redis Chat App ({ connectionCount }) </h1>

      <ol className="flex-1 overflow-y-scroll overflow-x-hidden">
        {messages.map(m => {
          return (
            <li className="bg-gray-100 rounded-lg p-4 my-2 break-all" key={m.id} ref={messageListRef}>
              <p className="text-small text-gray-500">{new Date(m.createdAt).toLocaleDateString(undefined, options)}</p>
              <p className="text-small text-gray-500">{m.port}</p>
              <p>{m.message}</p>
            </li>
          );
        })}
      </ol>

      <form onSubmit={handleSubmit} className="flex items-center">
        <Textarea
          className="rounded-lg mr-4"
          placeholder="Tell us what's on your mind"
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          maxLength={255}
        />
        <Button type="submit" className="h-full">Send Message</Button>
      </form>
    </main>
  );
}
