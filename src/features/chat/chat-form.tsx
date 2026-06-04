import { api } from "@api";
import { useMutation } from "convex/react";
import { SendHorizontalIcon } from "lucide-react";
import { FormEvent, KeyboardEvent, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getConvexErrorMessage } from "@/lib/convex-error";
import type { RoomId } from "../rooms/client/room-types";

export function ChatForm({ roomId }: { roomId: RoomId }) {
  const sendChatMessage = useMutation(api.rooms.sendChatMessage);
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const trimmedBody = body.trim();

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!trimmedBody || sending) {
      return;
    }

    setSending(true);
    try {
      await sendChatMessage({ roomId, body: trimmedBody });
      setBody("");
    } catch (error) {
      toast.error(getConvexErrorMessage(error, "Message could not be sent."));
    } finally {
      setSending(false);
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) {
      return;
    }

    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form className="flex flex-1 gap-2" onSubmit={handleSubmit}>
      <Textarea
        aria-label="Message"
        className="max-h-28 min-h-10 rounded-xl py-2 text-sm"
        disabled={sending}
        maxLength={1000}
        onChange={(event) => setBody(event.currentTarget.value)}
        onKeyDown={handleKeyDown}
        placeholder="Message"
        value={body}
      />
      <Button
        aria-label="Send"
        disabled={!trimmedBody || sending}
        size="icon"
        type="submit"
      >
        <SendHorizontalIcon />
      </Button>
    </form>
  );
}
