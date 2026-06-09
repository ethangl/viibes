import { useState } from "react";

import {
  Section,
  SectionContent,
  SectionHeader,
  SectionTitle,
} from "@/components/section";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarToggle,
  SidebarWrapper,
} from "@/components/sidebar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAppCapabilities } from "@/app/app-runtime";
import { GoogleSignInButton } from "@/features/auth";
import { UserMenu } from "@/features/chat/user-menu";
import { MessageSquareIcon, PanelRightCloseIcon } from "lucide-react";
import { useRooms } from "../runtime/rooms-provider";

export function RoomCreateForm() {
  const { createRoom } = useRooms();
  const { canCreateRoom } = useAppCapabilities();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim()) {
      return;
    }

    setSubmitting(true);
    try {
      const createdRoomId = await createRoom({
        name,
        description,
      });
      if (!createdRoomId) {
        return;
      }

      setName("");
      setDescription("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Sidebar>
      <SidebarWrapper style={{ "--section-color": "var(--color-red-400)" }}>
        <SidebarHeader>
          <SidebarToggle
            collapseIcon={<PanelRightCloseIcon />}
            expandIcon={<MessageSquareIcon />}
          />
        </SidebarHeader>
        <SidebarContent>
          <Section>
            <SectionHeader>
              <SectionTitle>Start a Room</SectionTitle>
            </SectionHeader>
            <SectionContent>
              {canCreateRoom ? (
                <form className="space-y-3" onSubmit={handleSubmit}>
                  <Input
                    name="room-name"
                    value={name}
                    onValueChange={setName}
                    placeholder="Weekend warmup"
                    className="h-11 bg-white/10"
                  />
                  <Input
                    name="room-description"
                    value={description}
                    onValueChange={setDescription}
                    placeholder="What kind of room is this?"
                    className="h-11 bg-white/10"
                  />
                  <Button
                    type="submit"
                    size="lg"
                    disabled={submitting || !name.trim()}
                  >
                    {submitting ? "Opening room..." : "Create room"}
                  </Button>
                </form>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground">
                    Sign in to create a room. You can keep browsing and listening
                    as a guest.
                  </p>
                  <GoogleSignInButton />
                </div>
              )}
            </SectionContent>
          </Section>
        </SidebarContent>
        <SidebarFooter>
          <UserMenu />
        </SidebarFooter>
      </SidebarWrapper>
    </Sidebar>
  );
}
